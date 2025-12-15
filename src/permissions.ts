import type { CanUseToolFn } from './hooks/useCanUseTool'
import { Tool, ToolUseContext } from './Tool'
import { BashTool, inputSchema } from './tools/BashTool/BashTool'
import { BashOutputTool } from './tools/BashOutputTool/BashOutputTool'
import { AgentOutputTool } from './tools/AgentOutputTool/AgentOutputTool'
import { EnterPlanModeTool } from './tools/PlanModeTool/EnterPlanModeTool'
import { ExitPlanModeTool } from './tools/PlanModeTool/ExitPlanModeTool'
import { FileEditTool } from './tools/FileEditTool/FileEditTool'
import { FileReadTool } from './tools/FileReadTool/FileReadTool'
import { FileWriteTool } from './tools/FileWriteTool/FileWriteTool'
import { GlobTool } from './tools/GlobTool/GlobTool'
import { GrepTool } from './tools/GrepTool/GrepTool'
import { KillShellTool } from './tools/KillShellTool/KillShellTool'
import { NotebookEditTool } from './tools/NotebookEditTool/NotebookEditTool'
import { ListMcpResourcesTool } from './tools/ListMcpResourcesTool/ListMcpResourcesTool'
import { ReadMcpResourceTool } from './tools/ReadMcpResourceTool/ReadMcpResourceTool'
import { WebFetchTool } from './tools/WebFetchTool/WebFetchTool'
import { WebSearchTool } from './tools/WebSearchTool/WebSearchTool'
import { AskUserQuestionTool } from './tools/AskUserQuestionTool/AskUserQuestionTool'
import { SlashCommandTool } from './tools/SlashCommandTool/SlashCommandTool'
import { SkillTool } from './tools/SkillTool/SkillTool'
import { TodoWriteTool } from './tools/TodoWriteTool/TodoWriteTool'
import { getCommandSubcommandPrefix, splitCommand } from './utils/commands'
import {
  getCurrentProjectConfig,
  saveCurrentProjectConfig,
} from '@utils/config'
import { AbortError } from './utils/errors'
import { logError } from './utils/log'
import { grantWritePermissionForPath } from './utils/permissions/filesystem'
import { getCwd } from './utils/state'
import { PRODUCT_NAME } from './constants/product'
import {
  getPlanConversationKey,
  getPlanFilePath,
  isPlanModeEnabled,
} from './utils/planMode'
import { getPermissionMode } from './utils/permissionModeState'
import { pathInOriginalCwd } from './utils/permissions/filesystem'
import { isAbsolute, resolve } from 'path'

// Commands that are known to be safe for execution
const SAFE_COMMANDS = new Set([
  'git status',
  'git diff',
  'git log',
  'git branch',
  'pwd',
  'tree',
  'date',
  'which',
])

const PLAN_MODE_ALLOWED_NON_READONLY_TOOLS = new Set<string>([
  // Plan mode exceptions: still allowed even though not read-only.
  TodoWriteTool.name,
  ExitPlanModeTool.name,
  // KillShell is allowed to stop a runaway background command.
  KillShellTool.name,
])

export function isToolAllowedInPlanMode(toolName: string): boolean {
  return PLAN_MODE_ALLOWED_NON_READONLY_TOOLS.has(toolName)
}

export const bashToolCommandHasExactMatchPermission = (
  tool: Tool,
  command: string,
  allowedTools: string[],
): boolean => {
  if (SAFE_COMMANDS.has(command)) {
    return true
  }
  // Check exact match first
  if (allowedTools.includes(getPermissionKey(tool, { command }, null))) {
    return true
  }
  // Check if command is an exact match with an approved prefix
  if (allowedTools.includes(getPermissionKey(tool, { command }, command))) {
    return true
  }
  return false
}

export const bashToolCommandHasPermission = (
  tool: Tool,
  command: string,
  prefix: string | null,
  allowedTools: string[],
): boolean => {
  // Check exact match first
  if (bashToolCommandHasExactMatchPermission(tool, command, allowedTools)) {
    return true
  }
  return allowedTools.includes(getPermissionKey(tool, { command }, prefix))
}

export const bashToolHasPermission = async (
  tool: Tool,
  command: string,
  context: ToolUseContext,
  allowedTools: string[],
  getCommandSubcommandPrefixFn = getCommandSubcommandPrefix,
): Promise<PermissionResult> => {
  if (bashToolCommandHasExactMatchPermission(tool, command, allowedTools)) {
    // This is an exact match for a command that is allowed, so we can skip the prefix check
    return { result: true }
  }

  const subCommands = splitCommand(command).filter(_ => {
    // Denim likes to add this, we strip it out so we don't need to prompt the user each time
    if (_ === `cd ${getCwd()}`) {
      return false
    }
    return true
  })
  const commandSubcommandPrefix = await getCommandSubcommandPrefixFn(
    command,
    context.abortController.signal,
  )
  if (context.abortController.signal.aborted) {
    throw new AbortError()
  }

  if (commandSubcommandPrefix === null) {
    // Fail closed and ask for user approval if the command prefix query failed (e.g. due to network error)
    // This is NOT the same as `fullCommandPrefix.commandPrefix === null`, which means no prefix was detected
    return {
      result: false,
      message: `${PRODUCT_NAME} requested permissions to use ${tool.name}, but you haven't granted it yet.`,
    }
  }

  if (commandSubcommandPrefix.commandInjectionDetected) {
    // Only allow exact matches for potential command injections
    if (bashToolCommandHasExactMatchPermission(tool, command, allowedTools)) {
      return { result: true }
    } else {
      return {
        result: false,
        message: `${PRODUCT_NAME} requested permissions to use ${tool.name}, but you haven't granted it yet.`,
      }
    }
  }

  // If there is only one command, no need to process subCommands
  if (subCommands.length < 2) {
    if (
      bashToolCommandHasPermission(
        tool,
        command,
        commandSubcommandPrefix.commandPrefix,
        allowedTools,
      )
    ) {
      return { result: true }
    } else {
      return {
        result: false,
        message: `${PRODUCT_NAME} requested permissions to use ${tool.name}, but you haven't granted it yet.`,
      }
    }
  }
  if (
    subCommands.every(subCommand => {
      const prefixResult =
        commandSubcommandPrefix.subcommandPrefixes.get(subCommand)
      if (prefixResult === undefined || prefixResult.commandInjectionDetected) {
        // If prefix result is missing or command injection is detected, always ask for permission
        return false
      }
      const hasPermission = bashToolCommandHasPermission(
        tool,
        subCommand,
        prefixResult ? prefixResult.commandPrefix : null,
        allowedTools,
      )
      return hasPermission
    })
  ) {
    return { result: true }
  }
  return {
    result: false,
    message: `${PRODUCT_NAME} requested permissions to use ${tool.name}, but you haven't granted it yet.`,
  }
}

type PermissionResult =
  | { result: true }
  | { result: false; message: string; shouldPromptUser?: boolean }

function isAllowedToolUseInPlanMode(
  tool: Tool,
  input: { [k: string]: unknown },
  context: ToolUseContext,
): boolean {
  if (tool.isReadOnly()) return true
  if (PLAN_MODE_ALLOWED_NON_READONLY_TOOLS.has(tool.name)) return true

  // Special-case: allow editing/writing ONLY the plan file while in plan mode.
  if (tool === FileWriteTool || tool === FileEditTool) {
    const filePath = typeof input.file_path === 'string' ? input.file_path : ''
    if (!filePath) return false

    const conversationKey = getPlanConversationKey(context)
    const allowedPlanFile = getPlanFilePath(context.agentId, conversationKey)
    const resolvedFilePath = isAbsolute(filePath)
      ? resolve(filePath)
      : resolve(getCwd(), filePath)
    return resolvedFilePath === resolve(allowedPlanFile)
  }

  return false
}

export const hasPermissionsToUseTool: CanUseToolFn = async (
  tool,
  input,
  context,
  _assistantMessage,
): Promise<PermissionResult> => {
  const permissionMode = getPermissionMode(context)
  const requiresUserInteraction = tool.requiresUserInteraction?.(input as never) ?? false

  if (isPlanModeEnabled(context) && !isAllowedToolUseInPlanMode(tool, input, context)) {
    return {
      result: false,
      message:
        'Plan mode is enabled. Only read-only and planning tools are allowed until you exit plan mode.',
      shouldPromptUser: false,
    }
  }

  // Claude Code parity: in bypass mode, still prompt for tools that require an interactive UI.
  if (permissionMode === 'bypassPermissions' && !requiresUserInteraction) {
    return { result: true }
  }

  // Claude Code parity: always prompt for tools that require a user interaction UI.
  if (requiresUserInteraction) {
    return {
      result: false,
      message: `${PRODUCT_NAME} requested permissions to use ${tool.name}, but you haven't granted it yet.`,
    }
  }

  if (permissionMode === 'acceptEdits') {
    if (tool === FileEditTool || tool === FileWriteTool) {
      const filePath = typeof (input as any).file_path === 'string' ? (input as any).file_path : ''
      if (filePath && pathInOriginalCwd(filePath)) {
        return { result: true }
      }
    }

    if (tool === NotebookEditTool) {
      const notebookPath =
        typeof (input as any).notebook_path === 'string' ? (input as any).notebook_path : ''
      if (notebookPath && pathInOriginalCwd(notebookPath)) {
        return { result: true }
      }
    }
  }

  if (context.abortController.signal.aborted) {
    throw new AbortError()
  }

  // Check if the tool needs permissions
  try {
    if (!tool.needsPermissions(input as never)) {
      return { result: true }
    }
  } catch (e) {
    logError(`Error checking permissions: ${e}`)
    return { result: false, message: 'Error checking permissions' }
  }

  const projectConfig = getCurrentProjectConfig()
  const allowedTools = projectConfig.allowedTools ?? []
  const commandAllowedTools = Array.isArray(context.options?.commandAllowedTools)
    ? context.options!.commandAllowedTools!
    : []
  const effectiveAllowedTools = [...new Set([...allowedTools, ...commandAllowedTools])]
  // Special case for BashTool to allow blanket commands without exposing them in the UI
  if (tool === BashTool && effectiveAllowedTools.includes(BashTool.name)) {
    return { result: true }
  }

  // TODO: Move this into tool definitions (done for read tools!)
  switch (tool) {
    // For bash tool, check each sub-command's permissions separately
    case BashTool: {
      // The types have already been validated by the tool,
      // so we can safely parse the input (as opposed to safeParse).
      const { command } = inputSchema.parse(input)
      return await bashToolHasPermission(
        tool,
        command,
        context,
        effectiveAllowedTools,
      )
    }
    case SlashCommandTool: {
      const command = typeof (input as any).command === 'string' ? (input as any).command : ''
      const trimmed = command.trim()
      const exactKey = getPermissionKey(tool, { command: trimmed }, null)
      if (effectiveAllowedTools.includes(exactKey)) {
        return { result: true }
      }

      // Support prefix rules like "/review-pr:*"
      const firstWord = trimmed.split(/\s+/)[0]
      if (firstWord && firstWord.startsWith('/')) {
        const prefixKey = getPermissionKey(tool, { command: trimmed }, firstWord)
        if (effectiveAllowedTools.includes(prefixKey)) {
          return { result: true }
        }
      }

      return {
        result: false,
        message: `${PRODUCT_NAME} requested permissions to use ${tool.name}, but you haven't granted it yet.`,
      }
    }
    case SkillTool: {
      const rawSkill = typeof (input as any).skill === 'string' ? (input as any).skill : ''
      const skillName = rawSkill.trim().replace(/^\//, '')
      const exactKey = getPermissionKey(tool, { skill: skillName }, null)
      if (effectiveAllowedTools.includes(exactKey)) {
        return { result: true }
      }
      return {
        result: false,
        message: `${PRODUCT_NAME} requested permissions to use ${tool.name}, but you haven't granted it yet.`,
      }
    }
    // For file editing tools, check session-only permissions
    case FileEditTool:
    case FileWriteTool:
    case NotebookEditTool: {
      // The types have already been validated by the tool,
      // so we can safely pass this in
      if (!tool.needsPermissions(input)) {
        return { result: true }
      }
      return {
        result: false,
        message: `${PRODUCT_NAME} requested permissions to use ${tool.name}, but you haven't granted it yet.`,
      }
    }
    // For other tools, check persistent permissions
    default: {
      const permissionKey = getPermissionKey(tool, input, null)
      if (effectiveAllowedTools.includes(permissionKey)) {
        return { result: true }
      }

      return {
        result: false,
        message: `${PRODUCT_NAME} requested permissions to use ${tool.name}, but you haven't granted it yet.`,
      }
    }
  }
}

export async function savePermission(
  tool: Tool,
  input: { [k: string]: unknown },
  prefix: string | null,
): Promise<void> {
  const key = getPermissionKey(tool, input, prefix)

  // For file editing tools, store write permissions only in memory
  if (
    tool === FileEditTool ||
    tool === FileWriteTool ||
    tool === NotebookEditTool
  ) {
    const filePath =
      tool === NotebookEditTool
        ? (typeof (input as any).notebook_path === 'string'
            ? (input as any).notebook_path
            : '')
        : typeof (input as any).file_path === 'string'
          ? (input as any).file_path
          : ''
    if (filePath) {
      grantWritePermissionForPath(filePath)
    }
    return
  }

  // For other tools, store permissions on disk
  const projectConfig = getCurrentProjectConfig()
  if (projectConfig.allowedTools.includes(key)) {
    return
  }

  projectConfig.allowedTools.push(key)
  projectConfig.allowedTools.sort()

  saveCurrentProjectConfig(projectConfig)
}

function getPermissionKey(
  tool: Tool,
  input: { [k: string]: unknown },
  prefix: string | null,
): string {
  switch (tool) {
    case BashTool:
      if (prefix) {
        return `${BashTool.name}(${prefix}:*)`
      }
      return `${BashTool.name}(${BashTool.renderToolUseMessage(input as never)})`
    case WebFetchTool: {
      const url = typeof input.url === 'string' ? input.url : ''
      try {
        const parsed = new URL(url)
        const hostname = parsed.hostname
        return `${WebFetchTool.name}(domain:${hostname})`
      } catch {
        return `${WebFetchTool.name}(domain:unknown)`
      }
    }
    case SlashCommandTool: {
      const command = typeof input.command === 'string' ? input.command.trim() : ''
      if (prefix) {
        return `${SlashCommandTool.name}(${prefix}:*)`
      }
      return `${SlashCommandTool.name}(${command})`
    }
    case SkillTool: {
      const raw = typeof input.skill === 'string' ? input.skill : ''
      const skill = raw.trim().replace(/^\//, '')
      if (prefix) {
        const p = prefix.trim().replace(/^\//, '')
        return `${SkillTool.name}(${p}:*)`
      }
      return `${SkillTool.name}(${skill})`
    }
    default:
      return tool.name
  }
}
