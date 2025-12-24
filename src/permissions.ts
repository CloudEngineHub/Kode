import type { CanUseToolFn } from './hooks/useCanUseTool'
import { Tool, ToolUseContext } from './Tool'
import { BashTool, inputSchema } from './tools/BashTool/BashTool'
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
import { isAbsolute, resolve } from 'path'
import { homedir } from 'os'
import { minimatch } from 'minimatch'
import { persistToolPermissionUpdateToDisk } from '@utils/permissions/toolPermissionSettings'
import { applyToolPermissionContextUpdateForConversationKey } from '@utils/toolPermissionContextState'
import {
  expandSymlinkPaths,
  getSpecialAllowedReadReason,
  getWriteSafetyCheckForPath,
  hasSuspiciousWindowsPathPattern,
  isPathInWorkingDirectories,
  isPlanFileForContext,
  matchPermissionRuleForPath,
  suggestFilePermissionUpdates,
} from '@utils/permissions/fileToolPermissionEngine'
import { getBunShellSandboxPlan } from '@utils/sandbox/bunShellSandboxPlan'
import {
  checkBashPermissions,
  checkBashPermissionsAutoAllowedBySandbox,
} from '@utils/permissions/bashToolPermissionEngine'
import {
  createDefaultToolPermissionContext,
  type ToolPermissionContextUpdate,
} from '@kode-types/toolPermissionContext'
import { parseMcpToolName } from '@utils/permissions/ruleString'

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

function parseBoolLike(value: string | undefined): boolean {
  if (!value) return false
  const v = value.trim().toLowerCase()
  return ['1', 'true', 'yes', 'y', 'on', 'enable', 'enabled'].includes(v)
}

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

const bashToolCommandHasExplicitRule = (
  tool: Tool,
  command: string,
  prefix: string | null,
  rules: string[],
): boolean => {
  // Exact match
  if (rules.includes(getPermissionKey(tool, { command }, null))) {
    return true
  }
  // Exact match stored as a prefix rule (e.g. Bash("git status":*))
  if (rules.includes(getPermissionKey(tool, { command }, command))) {
    return true
  }
  // Prefix match (e.g. Bash(git:*))
  if (prefix && rules.includes(getPermissionKey(tool, { command }, prefix))) {
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
  deniedTools: string[] = [],
  askedTools: string[] = [],
  getCommandSubcommandPrefixFn = getCommandSubcommandPrefix,
): Promise<PermissionResult> => {
  const trimmedCommand = command.trim()
  const exactKey = getPermissionKey(tool, { command: trimmedCommand }, null)
  if (deniedTools.includes(exactKey)) {
    return {
      result: false,
      message: `Permission to use ${tool.name} with command ${trimmedCommand} has been denied.`,
      shouldPromptUser: false,
    }
  }
  if (askedTools.includes(exactKey)) {
    return {
      result: false,
      message: `${PRODUCT_NAME} requested permissions to use ${tool.name}, but you haven't granted it yet.`,
    }
  }

  if (
    bashToolCommandHasExactMatchPermission(tool, trimmedCommand, allowedTools)
  ) {
    // This is an exact match for a command that is allowed, so we can skip the prefix check
    return { result: true }
  }

  const subCommands = splitCommand(trimmedCommand).filter(_ => {
    // Denim likes to add this, we strip it out so we don't need to prompt the user each time
    if (_ === `cd ${getCwd()}`) {
      return false
    }
    return true
  })
  const commandSubcommandPrefix = await getCommandSubcommandPrefixFn(
    trimmedCommand,
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
    if (
      bashToolCommandHasExplicitRule(tool, trimmedCommand, null, deniedTools)
    ) {
      return {
        result: false,
        message: `Permission to use ${tool.name} with command ${trimmedCommand} has been denied.`,
        shouldPromptUser: false,
      }
    }
    if (
      bashToolCommandHasExplicitRule(tool, trimmedCommand, null, askedTools)
    ) {
      return {
        result: false,
        message: `${PRODUCT_NAME} requested permissions to use ${tool.name}, but you haven't granted it yet.`,
      }
    }
    if (
      bashToolCommandHasExactMatchPermission(tool, trimmedCommand, allowedTools)
    ) {
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
      bashToolCommandHasExplicitRule(
        tool,
        trimmedCommand,
        commandSubcommandPrefix.commandPrefix,
        deniedTools,
      )
    ) {
      return {
        result: false,
        message: `Permission to use ${tool.name} with command ${trimmedCommand} has been denied.`,
        shouldPromptUser: false,
      }
    }
    if (
      bashToolCommandHasExplicitRule(
        tool,
        trimmedCommand,
        commandSubcommandPrefix.commandPrefix,
        askedTools,
      )
    ) {
      return {
        result: false,
        message: `${PRODUCT_NAME} requested permissions to use ${tool.name}, but you haven't granted it yet.`,
      }
    }
    if (
      bashToolCommandHasPermission(
        tool,
        trimmedCommand,
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
      if (
        bashToolCommandHasExplicitRule(
          tool,
          subCommand,
          prefixResult ? prefixResult.commandPrefix : null,
          deniedTools,
        )
      ) {
        return false
      }
      if (
        bashToolCommandHasExplicitRule(
          tool,
          subCommand,
          prefixResult ? prefixResult.commandPrefix : null,
          askedTools,
        )
      ) {
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

  const deniedSubcommand = subCommands.find(subCommand => {
    const prefixResult =
      commandSubcommandPrefix.subcommandPrefixes.get(subCommand)
    if (!prefixResult || prefixResult.commandInjectionDetected) return false
    return bashToolCommandHasExplicitRule(
      tool,
      subCommand,
      prefixResult.commandPrefix,
      deniedTools,
    )
  })
  if (deniedSubcommand) {
    return {
      result: false,
      message: `Permission to use ${tool.name} with command ${deniedSubcommand.trim()} has been denied.`,
      shouldPromptUser: false,
    }
  }

  const askedSubcommand = subCommands.find(subCommand => {
    const prefixResult =
      commandSubcommandPrefix.subcommandPrefixes.get(subCommand)
    if (!prefixResult || prefixResult.commandInjectionDetected) return false
    return bashToolCommandHasExplicitRule(
      tool,
      subCommand,
      prefixResult.commandPrefix,
      askedTools,
    )
  })
  if (askedSubcommand) {
    return {
      result: false,
      message: `${PRODUCT_NAME} requested permissions to use ${tool.name}, but you haven't granted it yet.`,
    }
  }

  return {
    result: false,
    message: `${PRODUCT_NAME} requested permissions to use ${tool.name}, but you haven't granted it yet.`,
  }
}

type PermissionResult =
  | { result: true }
  | {
      result: false
      message: string
      shouldPromptUser?: boolean
      suggestions?: ToolPermissionContextUpdate[]
    }

function flattenPermissionRuleGroups(
  groups: Partial<Record<string, string[]>> | undefined,
): string[] {
  if (!groups) return []
  const out: string[] = []
  for (const rules of Object.values(groups)) {
    if (!Array.isArray(rules)) continue
    for (const rule of rules) {
      if (typeof rule !== 'string') continue
      out.push(rule)
    }
  }
  return out
}

function isAllowedToolUseInPlanMode(
  tool: Tool,
  input: { [k: string]: unknown },
  context: ToolUseContext,
): boolean {
  if (tool.isReadOnly(input as never)) return true
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
  const isDontAskMode = permissionMode === 'dontAsk'
  const shouldAvoidPermissionPrompts =
    context.options?.shouldAvoidPermissionPrompts === true
  const safeMode = Boolean(context.options?.safeMode ?? context.safeMode)
  const requiresUserInteraction =
    tool.requiresUserInteraction?.(input as never) ?? false
  const dontAskDenied: PermissionResult = {
    result: false,
    message: `Permission to use ${tool.name} has been auto-denied in dontAsk mode.`,
    shouldPromptUser: false,
  }
  const promptsUnavailableDenied: PermissionResult = {
    result: false,
    message: `Permission to use ${tool.name} has been auto-denied (prompts unavailable).`,
    shouldPromptUser: false,
  }

  // Bypass mode still prompts for tools that require an interactive UI.
  if (permissionMode === 'bypassPermissions' && !requiresUserInteraction) {
    const bypassSafetyFloor =
      parseBoolLike(process.env.KODE_BYPASS_SAFETY_FLOOR) && !safeMode

    if (!bypassSafetyFloor) {
      const denyIfUnsafeWrite = (toolPath: string): PermissionResult | null => {
        const safety = getWriteSafetyCheckForPath(toolPath)
        if ('message' in safety) {
          return {
            result: false,
            message: safety.message,
            // In bypass mode we cannot prompt, so this is a hard deny.
            shouldPromptUser: false,
          }
        }
        return null
      }

      if (tool === FileWriteTool || tool === FileEditTool) {
        const filePath =
          typeof (input as any).file_path === 'string'
            ? String((input as any).file_path)
            : ''
        if (filePath) {
          const denied = denyIfUnsafeWrite(filePath)
          if (denied) return denied
        }
      }

      if (tool === NotebookEditTool) {
        const notebookPath =
          typeof (input as any).notebook_path === 'string'
            ? String((input as any).notebook_path)
            : ''
        if (notebookPath) {
          const denied = denyIfUnsafeWrite(notebookPath)
          if (denied) return denied
        }
      }
    }

    return { result: true }
  }

  // Always prompt for tools that require user interaction.
  if (requiresUserInteraction) {
    if (isDontAskMode) {
      return dontAskDenied
    }
    if (shouldAvoidPermissionPrompts) {
      return promptsUnavailableDenied
    }
    return {
      result: false,
      message: `${PRODUCT_NAME} requested permissions to use ${tool.name}, but you haven't granted it yet.`,
    }
  }

  if (context.abortController.signal.aborted) {
    throw new AbortError()
  }

  const isFilesystemLikeTool =
    tool === FileReadTool ||
    tool === FileEditTool ||
    tool === FileWriteTool ||
    tool === NotebookEditTool ||
    tool === GlobTool ||
    tool === GrepTool

  // Check if the tool needs permissions. For filesystem-like tools we must always
  // run reference CLI parity checks (symlinks, UNC, suspicious paths, working dirs).
  if (!isFilesystemLikeTool) {
    try {
      if (!tool.needsPermissions(input as never)) {
        return { result: true }
      }
    } catch (e) {
      logError(`Error checking permissions: ${e}`)
      return { result: false, message: 'Error checking permissions' }
    }
  }

  const projectConfig = getCurrentProjectConfig()
  const toolPermissionContext = context.options?.toolPermissionContext
  const allowedTools = toolPermissionContext
    ? flattenPermissionRuleGroups(toolPermissionContext.alwaysAllowRules)
    : (projectConfig.allowedTools ?? [])
  const deniedTools = toolPermissionContext
    ? flattenPermissionRuleGroups(toolPermissionContext.alwaysDenyRules)
    : (projectConfig.deniedTools ?? [])
  const askedTools = toolPermissionContext
    ? flattenPermissionRuleGroups(toolPermissionContext.alwaysAskRules)
    : (projectConfig.askedTools ?? [])
  const commandAllowedTools = Array.isArray(
    context.options?.commandAllowedTools,
  )
    ? context.options!.commandAllowedTools!
    : []
  const effectiveAllowedTools = [
    ...new Set([...allowedTools, ...commandAllowedTools]),
  ]
  const effectiveDeniedTools = [...new Set([...deniedTools])]
  const effectiveAskedTools = [...new Set([...askedTools])]
  // Special case for BashTool to allow blanket commands without exposing them in the UI
  if (tool === BashTool && effectiveAllowedTools.includes(BashTool.name)) {
    return { result: true }
  }

  const effectiveToolPermissionContext =
    context.options?.toolPermissionContext ??
    (() => {
      const fallback = createDefaultToolPermissionContext({
        isBypassPermissionsModeAvailable: !(context.options?.safeMode ?? false),
      })
      fallback.mode = permissionMode
      if (effectiveAllowedTools.length > 0) {
        fallback.alwaysAllowRules.localSettings = effectiveAllowedTools
      }
      if (effectiveDeniedTools.length > 0) {
        fallback.alwaysDenyRules.localSettings = effectiveDeniedTools
      }
      if (effectiveAskedTools.length > 0) {
        fallback.alwaysAskRules.localSettings = effectiveAskedTools
      }
      return fallback
    })()

  const checkEditPermissionForPath = (toolPath: string): PermissionResult => {
    const candidates = expandSymlinkPaths(toolPath)

    for (const candidate of candidates) {
      const deniedRule = matchPermissionRuleForPath({
        inputPath: candidate,
        toolPermissionContext: effectiveToolPermissionContext,
        operation: 'edit',
        behavior: 'deny',
      })
      if (deniedRule) {
        return {
          result: false,
          message: `Permission to edit ${toolPath} has been denied.`,
          shouldPromptUser: false,
        }
      }
    }

    if (isPlanFileForContext({ inputPath: toolPath, context })) {
      return { result: true }
    }

    const safety = getWriteSafetyCheckForPath(toolPath)
    if ('message' in safety) {
      return { result: false, message: safety.message }
    }

    for (const candidate of candidates) {
      const askedRule = matchPermissionRuleForPath({
        inputPath: candidate,
        toolPermissionContext: effectiveToolPermissionContext,
        operation: 'edit',
        behavior: 'ask',
      })
      if (askedRule) {
        return {
          result: false,
          message: `${PRODUCT_NAME} requested permissions to write to ${toolPath}, but you haven't granted it yet.`,
        }
      }
    }

    const inWorkingDirs = isPathInWorkingDirectories(
      toolPath,
      effectiveToolPermissionContext,
    )
    if (
      effectiveToolPermissionContext.mode === 'acceptEdits' &&
      inWorkingDirs
    ) {
      return { result: true }
    }

    const allowRule = matchPermissionRuleForPath({
      inputPath: toolPath,
      toolPermissionContext: effectiveToolPermissionContext,
      operation: 'edit',
      behavior: 'allow',
    })
    if (allowRule) {
      return { result: true }
    }

    return {
      result: false,
      message: `${PRODUCT_NAME} requested permissions to write to ${toolPath}, but you haven't granted it yet.`,
      suggestions: suggestFilePermissionUpdates({
        inputPath: toolPath,
        operation: 'write',
        toolPermissionContext: effectiveToolPermissionContext,
      }),
    }
  }

  // TODO: Move this into tool definitions (done for read tools!)
  const permissionResult: PermissionResult = await (async () => {
    switch (tool) {
      // For bash tool, check each sub-command's permissions separately
      case BashTool: {
        // The types have already been validated by the tool,
        // so we can safely parse the input (as opposed to safeParse).
        const { command, dangerouslyDisableSandbox } = inputSchema.parse(input)
        const trimmed = command.trim()
        if (SAFE_COMMANDS.has(trimmed)) {
          return { result: true }
        }

        const sandboxPlan = getBunShellSandboxPlan({
          command: trimmed,
          dangerouslyDisableSandbox: dangerouslyDisableSandbox === true,
          toolUseContext: context,
        })

        if (sandboxPlan.shouldBlockUnsandboxedCommand) {
          return {
            result: false,
            message:
              'This command must run in the sandbox, but sandboxed execution is not available.',
            shouldPromptUser: false,
          }
        }

        if (sandboxPlan.shouldAutoAllowBashPermissions) {
          if (effectiveToolPermissionContext.mode !== 'acceptEdits') {
            return await checkBashPermissions({
              command: trimmed,
              toolPermissionContext: effectiveToolPermissionContext,
              toolUseContext: context,
            })
          }
          return checkBashPermissionsAutoAllowedBySandbox({
            command: trimmed,
            toolPermissionContext: effectiveToolPermissionContext,
          })
        }

        return await checkBashPermissions({
          command: trimmed,
          toolPermissionContext: effectiveToolPermissionContext,
          toolUseContext: context,
        })
      }
      case SlashCommandTool: {
        const command =
          typeof (input as any).command === 'string'
            ? (input as any).command
            : ''
        const trimmed = command.trim()
        const exactKey = getPermissionKey(tool, { command: trimmed }, null)
        if (effectiveDeniedTools.includes(exactKey)) {
          return {
            result: false,
            message: `Permission to use ${tool.name}(${trimmed}) has been denied.`,
            shouldPromptUser: false,
          }
        }
        if (effectiveAskedTools.includes(exactKey)) {
          return {
            result: false,
            message: `${PRODUCT_NAME} requested permissions to use ${tool.name}, but you haven't granted it yet.`,
          }
        }
        if (effectiveAllowedTools.includes(exactKey)) {
          return { result: true }
        }

        // Support prefix rules like "/review-pr:*"
        const firstWord = trimmed.split(/\s+/)[0]
        if (firstWord && firstWord.startsWith('/')) {
          const prefixKey = getPermissionKey(
            tool,
            { command: trimmed },
            firstWord,
          )
          if (effectiveDeniedTools.includes(prefixKey)) {
            return {
              result: false,
              message: `Permission to use ${tool.name}(${firstWord}:*) has been denied.`,
              shouldPromptUser: false,
            }
          }
          if (effectiveAskedTools.includes(prefixKey)) {
            return {
              result: false,
              message: `${PRODUCT_NAME} requested permissions to use ${tool.name}, but you haven't granted it yet.`,
            }
          }
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
        const rawSkill =
          typeof (input as any).skill === 'string' ? (input as any).skill : ''
        const skillName = rawSkill.trim().replace(/^\//, '')
        const exactKey = getPermissionKey(tool, { skill: skillName }, null)
        if (effectiveDeniedTools.includes(exactKey)) {
          return {
            result: false,
            message: `Permission to use ${tool.name}(${skillName}) has been denied.`,
            shouldPromptUser: false,
          }
        }
        if (effectiveAskedTools.includes(exactKey)) {
          return {
            result: false,
            message: `${PRODUCT_NAME} requested permissions to use ${tool.name}, but you haven't granted it yet.`,
          }
        }
        if (effectiveAllowedTools.includes(exactKey)) {
          return { result: true }
        }

        const prefixes = getSkillPrefixes(skillName)
        for (const prefix of prefixes) {
          const prefixKey = getPermissionKey(tool, { skill: skillName }, prefix)
          if (effectiveDeniedTools.includes(prefixKey)) {
            return {
              result: false,
              message: `Permission to use ${tool.name}(${prefix}:*) has been denied.`,
              shouldPromptUser: false,
            }
          }
        }

        for (const prefix of prefixes) {
          const prefixKey = getPermissionKey(tool, { skill: skillName }, prefix)
          if (effectiveAskedTools.includes(prefixKey)) {
            return {
              result: false,
              message: `${PRODUCT_NAME} requested permissions to use ${tool.name}, but you haven't granted it yet.`,
            }
          }
        }

        for (const prefix of prefixes) {
          const prefixKey = getPermissionKey(tool, { skill: skillName }, prefix)
          if (effectiveAllowedTools.includes(prefixKey)) {
            return { result: true }
          }
        }

        return {
          result: false,
          message: `${PRODUCT_NAME} requested permissions to use ${tool.name}, but you haven't granted it yet.`,
        }
      }
      case FileReadTool:
      case GlobTool:
      case GrepTool: {
        const rawPath =
          tool === FileReadTool
            ? typeof (input as any).file_path === 'string'
              ? (input as any).file_path
              : ''
            : typeof (input as any).path === 'string'
              ? (input as any).path
              : ''
        const toolPath = rawPath || getCwd()

        const candidates = expandSymlinkPaths(toolPath)
        for (const candidate of candidates) {
          if (candidate.startsWith('\\\\') || candidate.startsWith('//')) {
            return {
              result: false,
              message: `${PRODUCT_NAME} requested permissions to read from ${toolPath}, which appears to be a UNC path that could access network resources.`,
            }
          }
        }
        for (const candidate of candidates) {
          if (hasSuspiciousWindowsPathPattern(candidate)) {
            return {
              result: false,
              message: `${PRODUCT_NAME} requested permissions to read from ${toolPath}, which contains a suspicious Windows path pattern that requires manual approval.`,
            }
          }
        }

        for (const candidate of candidates) {
          const deniedRule = matchPermissionRuleForPath({
            inputPath: candidate,
            toolPermissionContext: effectiveToolPermissionContext,
            operation: 'read',
            behavior: 'deny',
          })
          if (deniedRule) {
            return {
              result: false,
              message: `Permission to read ${toolPath} has been denied.`,
              shouldPromptUser: false,
            }
          }
        }

        for (const candidate of candidates) {
          const askedRule = matchPermissionRuleForPath({
            inputPath: candidate,
            toolPermissionContext: effectiveToolPermissionContext,
            operation: 'read',
            behavior: 'ask',
          })
          if (askedRule) {
            return {
              result: false,
              message: `${PRODUCT_NAME} requested permissions to read from ${toolPath}, but you haven't granted it yet.`,
            }
          }
        }

        const editDecision = checkEditPermissionForPath(toolPath)
        if (editDecision.result === true) {
          return { result: true }
        }

        if (
          isPathInWorkingDirectories(toolPath, effectiveToolPermissionContext)
        ) {
          return { result: true }
        }

        const specialReason = getSpecialAllowedReadReason({
          inputPath: toolPath,
          context,
        })
        if (specialReason) {
          return { result: true }
        }

        const allowRule = matchPermissionRuleForPath({
          inputPath: toolPath,
          toolPermissionContext: effectiveToolPermissionContext,
          operation: 'read',
          behavior: 'allow',
        })
        if (allowRule) {
          return { result: true }
        }

        return {
          result: false,
          message: `${PRODUCT_NAME} requested permissions to read from ${toolPath}, but you haven't granted it yet.`,
          suggestions: suggestFilePermissionUpdates({
            inputPath: toolPath,
            operation: 'read',
            toolPermissionContext: effectiveToolPermissionContext,
          }),
        }
      }
      case FileEditTool:
      case FileWriteTool:
      case NotebookEditTool: {
        const targetPath =
          tool === NotebookEditTool
            ? typeof (input as any).notebook_path === 'string'
              ? (input as any).notebook_path
              : ''
            : typeof (input as any).file_path === 'string'
              ? (input as any).file_path
              : ''
        const toolPath = targetPath || getCwd()
        return checkEditPermissionForPath(toolPath)
      }
      case WebFetchTool: {
        const permissionKey = getPermissionKey(tool, input, null)
        const openParenIndex = permissionKey.indexOf('(')
        const actualRuleContent =
          openParenIndex !== -1 && permissionKey.endsWith(')')
            ? permissionKey.slice(openParenIndex + 1, -1)
            : ''
        const actualHostname = actualRuleContent.startsWith('domain:')
          ? actualRuleContent.slice('domain:'.length)
          : null

        const matchesWebFetchRule = (rule: string): boolean => {
          if (rule === WebFetchTool.name) return true
          const open = rule.indexOf('(')
          if (open === -1 || !rule.endsWith(')')) return false
          const name = rule.slice(0, open)
          if (name !== WebFetchTool.name) return false
          const ruleContent = rule.slice(open + 1, -1).trim()
          if (!ruleContent) return false
          if (ruleContent.startsWith('domain:') && actualHostname !== null) {
            const hostPattern = ruleContent.slice('domain:'.length).trim()
            if (!hostPattern) return false
            return minimatch(actualHostname, hostPattern, {
              nocase: true,
              dot: true,
            })
          }
          return ruleContent === actualRuleContent
        }

        if (effectiveDeniedTools.some(matchesWebFetchRule)) {
          return {
            result: false,
            message: `Permission to use ${tool.name} has been denied.`,
            shouldPromptUser: false,
          }
        }
        if (effectiveAskedTools.some(matchesWebFetchRule)) {
          return {
            result: false,
            message: `${PRODUCT_NAME} requested permissions to use ${tool.name}, but you haven't granted it yet.`,
          }
        }
        if (effectiveAllowedTools.some(matchesWebFetchRule)) {
          return { result: true }
        }

        return {
          result: false,
          message: `${PRODUCT_NAME} requested permissions to use ${tool.name}, but you haven't granted it yet.`,
        }
      }
      case WebSearchTool: {
        const permissionKey = getPermissionKey(tool, input, null)
        const matchesWebSearchRule = (rule: string): boolean => {
          if (rule === WebSearchTool.name) return true
          return rule === permissionKey
        }

        if (effectiveDeniedTools.some(matchesWebSearchRule)) {
          return {
            result: false,
            message: `Permission to use ${tool.name} has been denied.`,
            shouldPromptUser: false,
          }
        }
        if (effectiveAskedTools.some(matchesWebSearchRule)) {
          return {
            result: false,
            message: `${PRODUCT_NAME} requested permissions to use ${tool.name}, but you haven't granted it yet.`,
          }
        }
        if (effectiveAllowedTools.some(matchesWebSearchRule)) {
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
        const matchesToolRule = (rule: string): boolean => {
          if (rule === permissionKey) return true

          const parsedTool = parseMcpToolName(permissionKey)
          if (!parsedTool) return false

          const parsedRule = parseMcpToolName(rule)
          if (!parsedRule) return false
          return (
            parsedRule.serverName === parsedTool.serverName &&
            parsedRule.toolName === '*'
          )
        }

        if (effectiveDeniedTools.some(matchesToolRule)) {
          return {
            result: false,
            message: `Permission to use ${tool.name} has been denied.`,
            shouldPromptUser: false,
          }
        }
        if (effectiveAskedTools.some(matchesToolRule)) {
          return {
            result: false,
            message: `${PRODUCT_NAME} requested permissions to use ${tool.name}, but you haven't granted it yet.`,
          }
        }
        if (effectiveAllowedTools.some(matchesToolRule)) {
          return { result: true }
        }

        return {
          result: false,
          message: `${PRODUCT_NAME} requested permissions to use ${tool.name}, but you haven't granted it yet.`,
        }
      }
    }
  })()

  if (
    isDontAskMode &&
    permissionResult.result === false &&
    permissionResult.shouldPromptUser !== false
  ) {
    return dontAskDenied
  }

  if (
    shouldAvoidPermissionPrompts &&
    permissionResult.result === false &&
    permissionResult.shouldPromptUser !== false
  ) {
    return promptsUnavailableDenied
  }

  return permissionResult
}

function normalizeGlobPath(p: string): string {
  return p.replace(/\\/g, '/')
}

function resolveAbsolutePathForPermission(p: string): string {
  const trimmed = String(p || '').trim()
  if (!trimmed) return resolve(getCwd())
  return isAbsolute(trimmed) ? resolve(trimmed) : resolve(getCwd(), trimmed)
}

function resolvePermissionPathPattern(pattern: string): string {
  const trimmed = pattern.trim()
  if (!trimmed) return trimmed

  if (trimmed === '~') {
    return resolve(homedir())
  }
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
    return resolve(homedir(), trimmed.slice(2))
  }

  return isAbsolute(trimmed) ? resolve(trimmed) : resolve(getCwd(), trimmed)
}

function toolRuleMatchesPath(
  rule: string,
  toolName: string,
  absolutePath: string,
): boolean {
  if (rule === toolName) return true
  const openParenIndex = rule.indexOf('(')
  if (openParenIndex === -1 || !rule.endsWith(')')) return false

  const name = rule.slice(0, openParenIndex)
  if (name !== toolName) return false

  const ruleContent = rule.slice(openParenIndex + 1, -1).trim()
  if (!ruleContent) return false

  const absolutePattern = resolvePermissionPathPattern(ruleContent)
  return minimatch(
    normalizeGlobPath(absolutePath),
    normalizeGlobPath(absolutePattern),
    { dot: true, nocase: process.platform === 'win32' },
  )
}

function getSkillPrefixes(skillName: string): string[] {
  const parts = skillName
    .split(':')
    .map(p => p.trim())
    .filter(Boolean)
  if (parts.length <= 1) return []
  return parts.slice(0, -1).map((_, idx) => parts.slice(0, idx + 1).join(':'))
}

export async function savePermission(
  tool: Tool,
  input: { [k: string]: unknown },
  prefix: string | null,
  context?: ToolUseContext,
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
        ? typeof (input as any).notebook_path === 'string'
          ? (input as any).notebook_path
          : ''
        : typeof (input as any).file_path === 'string'
          ? (input as any).file_path
          : ''
    if (filePath) {
      grantWritePermissionForPath(filePath)
    }
    return
  }

  // Persistence: write allow rules to .kode/settings.local.json (legacy .claude is read-compatible)
  try {
    const update = {
      type: 'addRules' as const,
      destination: 'localSettings' as const,
      behavior: 'allow' as const,
      rules: [key],
    }
    persistToolPermissionUpdateToDisk({ update })

    // Keep the in-memory permission context in sync for the current conversation.
    const messageLogName = context?.options?.messageLogName
    const forkNumber = context?.options?.forkNumber ?? 0
    if (messageLogName) {
      const conversationKey = `${messageLogName}:${forkNumber}`
      const nextToolPermissionContext =
        applyToolPermissionContextUpdateForConversationKey({
          conversationKey,
          isBypassPermissionsModeAvailable: !(
            context?.options?.safeMode ?? false
          ),
          update,
        })
      // Ensure subsequent tool uses in the same turn see the updated rules.
      if (context?.options) {
        ;(context.options as any).toolPermissionContext =
          nextToolPermissionContext
      }
    }
  } catch (error) {
    logError(error)
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
      return `${BashTool.name}(${typeof (input as any).command === 'string' ? String((input as any).command).trim() : ''})`
    case WebFetchTool: {
      try {
        const schema: any = (WebFetchTool as any).inputSchema
        const parsed = schema?.safeParse
          ? schema.safeParse(input)
          : { success: false }
        if (!parsed.success) {
          return `${WebFetchTool.name}(input:${String(input)})`
        }
        const url = parsed.data.url
        return `${WebFetchTool.name}(domain:${new URL(url).hostname})`
      } catch {
        return `${WebFetchTool.name}(input:${String(input)})`
      }
    }
    case WebSearchTool: {
      const query =
        typeof (input as any).query === 'string'
          ? String((input as any).query).trim()
          : ''
      if (!query) return WebSearchTool.name
      return `${WebSearchTool.name}(${query})`
    }
    case SlashCommandTool: {
      const command =
        typeof input.command === 'string' ? input.command.trim() : ''
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
