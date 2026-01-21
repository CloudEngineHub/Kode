import { logError } from '#core/utils/log'
import { getCwd } from '#core/utils/state'
import { getKodeAgentSessionId } from '#protocol/utils/kodeAgentSessionId'

import type {
  HookEventName,
  HookMatcher,
  StopHookOutcome,
  UserPromptHookOutcome,
} from '../types'
import {
  getHookAdditionalContext,
  getHookReason,
  getHookStopDecision,
  getHookSystemMessage,
} from '../types'
import { getDisableAllHooksState } from '../disableAllHooks'
import {
  coerceHookMessage,
  coerceHookPermissionMode,
  executeHooksForMatchers,
  tryParseHookJson,
} from '../executor'
import {
  loadPluginMatchers,
  loadSettingsMatchers,
  matcherMatchesTool,
} from '../registry'

function getApplicableMatchers(
  projectDir: string,
  event: HookEventName,
): HookMatcher[] {
  const matchers = [
    ...loadSettingsMatchers(projectDir, event),
    ...loadPluginMatchers(projectDir, event),
  ]
  return matchers.filter(m => matcherMatchesTool(m.matcher, '*'))
}

async function runBlockableHooks(args: {
  applicable: HookMatcher[]
  hookEvent: HookEventName
  hookInput: Record<string, unknown>
  cwd: string
  safeMode?: boolean
  signal?: AbortSignal
}): Promise<{
  blocked: string | null
  warnings: string[]
  systemMessages: string[]
  additionalContexts: string[]
}> {
  const warnings: string[] = []
  const systemMessages: string[] = []
  const additionalContexts: string[] = []

  const settled = await executeHooksForMatchers({
    matchers: args.applicable,
    hookEvent: args.hookEvent,
    hookInput: args.hookInput,
    cwd: args.cwd,
    safeMode: args.safeMode ?? false,
    parentSignal: args.signal,
    promptFallbackTimeoutMs: 30_000,
    commandFallbackTimeoutMs: 600_000,
  })

  for (const item of settled) {
    if (item.status === 'rejected') {
      logError(item.reason)
      warnings.push(`Hook failed to run: ${String(item.reason ?? '')}`)
      continue
    }

    const { result } = item.value

    if (result.exitCode === 2) {
      return {
        blocked: coerceHookMessage(result.stdout, result.stderr),
        warnings,
        systemMessages,
        additionalContexts,
      }
    }

    if (result.exitCode !== 0) {
      warnings.push(coerceHookMessage(result.stdout, result.stderr))
      continue
    }

    const json = tryParseHookJson(result.stdout)
    if (!json) continue

    const systemMessage = getHookSystemMessage(json)
    if (systemMessage) systemMessages.push(systemMessage)

    const additional = getHookAdditionalContext(json)
    if (additional) additionalContexts.push(additional)

    const stopDecision = getHookStopDecision(json)
    if (stopDecision === 'block') {
      const reason = getHookReason(json)
      const msg =
        reason ||
        (systemMessages.length > 0
          ? systemMessages.join('\n\n')
          : coerceHookMessage(result.stdout, result.stderr))
      return { blocked: msg, warnings, systemMessages, additionalContexts }
    }
  }

  return { blocked: null, warnings, systemMessages, additionalContexts }
}

async function runNonBlockingHooks(args: {
  applicable: HookMatcher[]
  hookEvent: HookEventName
  hookInput: Record<string, unknown>
  cwd: string
  safeMode?: boolean
  signal?: AbortSignal
}): Promise<{ warnings: string[]; systemMessages: string[] }> {
  const warnings: string[] = []
  const systemMessages: string[] = []

  const settled = await executeHooksForMatchers({
    matchers: args.applicable,
    hookEvent: args.hookEvent,
    hookInput: args.hookInput,
    cwd: args.cwd,
    safeMode: args.safeMode ?? false,
    parentSignal: args.signal,
    promptFallbackTimeoutMs: 30_000,
    commandFallbackTimeoutMs: 600_000,
  })

  for (const item of settled) {
    if (item.status === 'rejected') {
      logError(item.reason)
      warnings.push(`Hook failed to run: ${String(item.reason ?? '')}`)
      continue
    }

    const { result } = item.value
    if (result.exitCode !== 0) {
      warnings.push(coerceHookMessage(result.stdout, result.stderr))
      continue
    }

    const json = tryParseHookJson(result.stdout)
    if (!json) continue

    const systemMessage = getHookSystemMessage(json)
    if (systemMessage) systemMessages.push(systemMessage)
  }

  return { warnings, systemMessages }
}

export async function runStopHooks(args: {
  hookEvent: 'Stop' | 'SubagentStop'
  reason?: string
  agentId?: string
  permissionMode?: unknown
  cwd?: string
  transcriptPath?: string
  safeMode?: boolean
  stopHookActive?: boolean
  signal?: AbortSignal
}): Promise<StopHookOutcome> {
  const projectDir = args.cwd ?? getCwd()
  if (getDisableAllHooksState({ projectDir }).disabled) {
    return {
      decision: 'approve',
      warnings: [],
      systemMessages: [],
      additionalContexts: [],
    }
  }

  const applicable = getApplicableMatchers(projectDir, args.hookEvent)
  if (applicable.length === 0) {
    return {
      decision: 'approve',
      warnings: [],
      systemMessages: [],
      additionalContexts: [],
    }
  }

  const hookInput: Record<string, unknown> = {
    session_id: getKodeAgentSessionId(),
    transcript_path: args.transcriptPath,
    cwd: projectDir,
    hook_event_name: args.hookEvent,
    permission_mode: coerceHookPermissionMode(args.permissionMode),
    reason: args.reason,
    stop_hook_active: args.stopHookActive === true,
    ...(args.hookEvent === 'SubagentStop'
      ? { agent_id: args.agentId, agent_transcript_path: args.transcriptPath }
      : {}),
  }

  const outcome = await runBlockableHooks({
    applicable,
    hookEvent: args.hookEvent,
    hookInput,
    cwd: projectDir,
    safeMode: args.safeMode,
    signal: args.signal,
  })

  if (outcome.blocked) {
    return {
      decision: 'block',
      message: outcome.blocked,
      warnings: outcome.warnings,
      systemMessages: outcome.systemMessages,
      additionalContexts: outcome.additionalContexts,
    }
  }

  return {
    decision: 'approve',
    warnings: outcome.warnings,
    systemMessages: outcome.systemMessages,
    additionalContexts: outcome.additionalContexts,
  }
}

export async function runUserPromptSubmitHooks(args: {
  prompt: string
  permissionMode?: unknown
  cwd?: string
  transcriptPath?: string
  safeMode?: boolean
  signal?: AbortSignal
}): Promise<UserPromptHookOutcome> {
  const projectDir = args.cwd ?? getCwd()
  if (getDisableAllHooksState({ projectDir }).disabled) {
    return {
      decision: 'allow',
      warnings: [],
      systemMessages: [],
      additionalContexts: [],
    }
  }

  const applicable = getApplicableMatchers(projectDir, 'UserPromptSubmit')
  if (applicable.length === 0) {
    return {
      decision: 'allow',
      warnings: [],
      systemMessages: [],
      additionalContexts: [],
    }
  }

  const hookInput: Record<string, unknown> = {
    session_id: getKodeAgentSessionId(),
    transcript_path: args.transcriptPath,
    cwd: projectDir,
    hook_event_name: 'UserPromptSubmit',
    permission_mode: coerceHookPermissionMode(args.permissionMode),
    user_prompt: args.prompt,
    prompt: args.prompt,
  }

  const outcome = await runBlockableHooks({
    applicable,
    hookEvent: 'UserPromptSubmit',
    hookInput,
    cwd: projectDir,
    safeMode: args.safeMode,
    signal: args.signal,
  })

  if (outcome.blocked) {
    return {
      decision: 'block',
      message: outcome.blocked,
      warnings: outcome.warnings,
      systemMessages: outcome.systemMessages,
      additionalContexts: outcome.additionalContexts,
    }
  }

  return {
    decision: 'allow',
    warnings: outcome.warnings,
    systemMessages: outcome.systemMessages,
    additionalContexts: outcome.additionalContexts,
  }
}

export async function runSessionEndHooks(args: {
  reason: string
  permissionMode?: unknown
  cwd?: string
  transcriptPath?: string
  safeMode?: boolean
  signal?: AbortSignal
}): Promise<{ warnings: string[]; systemMessages: string[] }> {
  const projectDir = args.cwd ?? getCwd()
  if (getDisableAllHooksState({ projectDir }).disabled) {
    return { warnings: [], systemMessages: [] }
  }

  const applicable = getApplicableMatchers(projectDir, 'SessionEnd')
  if (applicable.length === 0) return { warnings: [], systemMessages: [] }

  const hookInput: Record<string, unknown> = {
    session_id: getKodeAgentSessionId(),
    transcript_path: args.transcriptPath,
    cwd: projectDir,
    hook_event_name: 'SessionEnd',
    permission_mode: coerceHookPermissionMode(args.permissionMode),
    reason: args.reason,
  }

  return runNonBlockingHooks({
    applicable,
    hookEvent: 'SessionEnd',
    hookInput,
    cwd: projectDir,
    safeMode: args.safeMode,
    signal: args.signal,
  })
}
