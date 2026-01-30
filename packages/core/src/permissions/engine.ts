import type { CanUseToolFn } from './canUseTool'
import type { PermissionResult } from './types'

import type { Tool, ToolUseContext } from '#core/tooling/Tool'
import { getCurrentProjectConfig } from '#config'
import { AbortError } from '#core/utils/errors'
import { logError } from '#core/utils/log'
import { getCwd } from '#core/utils/state'
import { PRODUCT_NAME } from '#core/constants/product'
import { getPermissionMode } from '#core/utils/permissionModeState'
import { normalizePermissionMode } from '#core/types/PermissionMode'
import { isAbsolute, resolve } from 'path'
import { resolveToolNameAlias } from '#core/utils/toolNameAliases'

import {
  createDefaultToolPermissionContext,
  type ToolPermissionContextUpdate,
} from '#core/types/toolPermissionContext'
import {
  expandSymlinkPaths,
  getWriteSafetyCheckForPath,
  isPathInWorkingDirectories,
  isSpecialAllowedWritePathForContext,
  matchPermissionRuleForPath,
  suggestFilePermissionUpdates,
} from '#core/utils/permissions/fileToolPermissionEngine'

import { checkToolPermissionByName } from './policies/byToolName'
import { getStringFromInput } from './policies/input'

export {
  SAFE_COMMANDS,
  bashToolCommandHasExactMatchPermission,
  bashToolCommandHasPermission,
  bashToolHasPermission,
} from './policies/bash'

const FILESYSTEM_LIKE_TOOL_NAMES = new Set([
  'Read',
  'LS',
  'Edit',
  'Write',
  'NotebookEdit',
  'Glob',
  'Grep',
])

function parseBoolLike(value: string | undefined): boolean {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return ['1', 'true', 'yes', 'y', 'on', 'enable', 'enabled'].includes(
    normalized,
  )
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
      out.push(resolveToolNameAlias(rule).resolvedName)
    }
  }
  return out
}

export const hasPermissionsToUseTool: CanUseToolFn = async (
  tool,
  input,
  context,
  assistantMessage,
): Promise<PermissionResult> => {
  const rawPermissionMode = getPermissionMode(context)
  const permissionMode = normalizePermissionMode(rawPermissionMode)
  const isDontAskMode = permissionMode === 'dontAsk'
  const isYoloMode = permissionMode === 'yolo'
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

  // Note: YOLO mode auto-approve is applied at the end, after deny/ask rules are checked

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
            shouldPromptUser: false,
          }
        }
        return null
      }

      if (tool.name === 'Write' || tool.name === 'Edit') {
        const filePath = getStringFromInput(input, 'file_path')
        if (filePath) {
          const denied = denyIfUnsafeWrite(filePath)
          if (denied) return denied
        }
      }

      if (tool.name === 'NotebookEdit') {
        const notebookPath = getStringFromInput(input, 'notebook_path')
        if (notebookPath) {
          const denied = denyIfUnsafeWrite(notebookPath)
          if (denied) return denied
        }
      }
    }

    return { result: true }
  }

  if (requiresUserInteraction) {
    if (isDontAskMode) return dontAskDenied
    if (shouldAvoidPermissionPrompts) return promptsUnavailableDenied
    return {
      result: false,
      message: `${PRODUCT_NAME} requested permissions to use ${tool.name}, but you haven't granted it yet.`,
    }
  }

  if (context.abortController.signal.aborted) {
    throw new AbortError()
  }

  const isFilesystemLikeTool = FILESYSTEM_LIKE_TOOL_NAMES.has(tool.name)
  if (!isFilesystemLikeTool) {
    try {
      if (!tool.needsPermissions(input as never)) {
        return { result: true }
      }
    } catch (error) {
      logError(`Error checking permissions: ${error}`)
      return { result: false, message: 'Error checking permissions' }
    }
  }

  const projectConfig = getCurrentProjectConfig()
  const toolPermissionContext = context.options?.toolPermissionContext
  const normalizeToolRule = (rule: string) =>
    resolveToolNameAlias(rule).resolvedName
  const allowedTools = toolPermissionContext
    ? flattenPermissionRuleGroups(toolPermissionContext.alwaysAllowRules)
    : (projectConfig.allowedTools ?? []).map(normalizeToolRule)
  const deniedTools = toolPermissionContext
    ? flattenPermissionRuleGroups(toolPermissionContext.alwaysDenyRules)
    : (projectConfig.deniedTools ?? []).map(normalizeToolRule)
  const askedTools = toolPermissionContext
    ? flattenPermissionRuleGroups(toolPermissionContext.alwaysAskRules)
    : (projectConfig.askedTools ?? []).map(normalizeToolRule)
  const commandAllowedTools = Array.isArray(
    context.options?.commandAllowedTools,
  )
    ? context.options.commandAllowedTools
    : []

  const effectiveAllowedTools = [
    ...new Set([...allowedTools, ...commandAllowedTools]),
  ]
  const effectiveDeniedTools = [...new Set(deniedTools)]
  const effectiveAskedTools = [...new Set(askedTools)]

  if (tool.name === 'Bash' && effectiveAllowedTools.includes('Bash')) {
    return { result: true }
  }

  let effectiveToolPermissionContext =
    toolPermissionContext ??
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

  if (toolPermissionContext) {
    effectiveToolPermissionContext = {
      ...toolPermissionContext,
      alwaysAllowRules: { ...toolPermissionContext.alwaysAllowRules },
      alwaysDenyRules: { ...toolPermissionContext.alwaysDenyRules },
      alwaysAskRules: { ...toolPermissionContext.alwaysAskRules },
    }
  }

  // Per-command allowedTools (e.g. `Read(~/**)`) must participate in the same
  // rule engine as persisted permission rules.
  if (commandAllowedTools.length > 0) {
    const existing =
      effectiveToolPermissionContext.alwaysAllowRules.command ?? []
    effectiveToolPermissionContext.alwaysAllowRules.command = [
      ...new Set([...existing, ...commandAllowedTools]),
    ]
  }

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
          blockedPath: toolPath,
          decisionReason: deniedRule,
        }
      }
    }

    if (isSpecialAllowedWritePathForContext({ inputPath: toolPath, context })) {
      return { result: true }
    }

    const safety = getWriteSafetyCheckForPath(toolPath)
    if ('message' in safety) {
      return {
        result: false,
        message: safety.message,
        blockedPath: toolPath,
        decisionReason: safety.message,
      }
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
          blockedPath: toolPath,
          decisionReason: askedRule,
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
    if (allowRule) return { result: true }

    return {
      result: false,
      message: `${PRODUCT_NAME} requested permissions to write to ${toolPath}, but you haven't granted it yet.`,
      blockedPath: toolPath,
      decisionReason: 'No allow rule matched (outside working directories)',
      suggestions: suggestFilePermissionUpdates({
        inputPath: toolPath,
        operation: 'write',
        toolPermissionContext: effectiveToolPermissionContext,
      }),
    }
  }

  const permissionResult = await checkToolPermissionByName({
    tool,
    input,
    context,
    assistantMessage,
    effectiveAllowedTools,
    effectiveDeniedTools,
    effectiveAskedTools,
    effectiveToolPermissionContext,
    checkEditPermissionForPath,
  })

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

  // YOLO mode: if result would prompt user (not explicitly denied), auto-approve instead
  // Explicit deny rules (shouldPromptUser: false) are still respected
  if (
    isYoloMode &&
    !requiresUserInteraction &&
    permissionResult.result === false &&
    permissionResult.shouldPromptUser !== false
  ) {
    return { result: true }
  }

  return permissionResult
}

export type { ToolPermissionContextUpdate }
