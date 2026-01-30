export type HookEventName =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PreCompact'
  | 'Stop'
  | 'SubagentStop'
  | 'UserPromptSubmit'
  | 'SessionStart'
  | 'SessionEnd'

export type CommandHook = {
  type: 'command'
  command: string
  /** Timeout in seconds (compatibility semantics). */
  timeout?: number
  pluginRoot?: string
}

export type PromptHook = {
  type: 'prompt'
  prompt: string
  /** Timeout in seconds (compatibility semantics). */
  timeout?: number
  pluginRoot?: string
}

export type Hook = CommandHook | PromptHook

export type HookMatcher = {
  matcher: string
  hooks: Hook[]
}

export type HookFileEnvelope = {
  description?: unknown
  hooks?: unknown
  [key: string]: unknown
}

export type HooksSettings = Partial<Record<HookEventName, HookMatcher[]>> & {
  [key: string]: unknown
}

export type SettingsFileWithHooks = {
  hooks?: HooksSettings
  [key: string]: unknown
}

export type PreToolUseHookOutcome =
  | {
      kind: 'allow'
      warnings: string[]
      permissionDecision?: 'allow' | 'ask'
      updatedInput?: Record<string, unknown>
      systemMessages?: string[]
      additionalContexts?: string[]
    }
  | {
      kind: 'block'
      message: string
      systemMessages?: string[]
      additionalContexts?: string[]
    }

export type StopHookOutcome =
  | {
      decision: 'approve'
      warnings: string[]
      systemMessages: string[]
      additionalContexts: string[]
    }
  | {
      decision: 'block'
      message: string
      warnings: string[]
      systemMessages: string[]
      additionalContexts: string[]
    }

export type UserPromptHookOutcome =
  | {
      decision: 'allow'
      warnings: string[]
      systemMessages: string[]
      additionalContexts: string[]
    }
  | {
      decision: 'block'
      message: string
      warnings: string[]
      systemMessages: string[]
      additionalContexts: string[]
    }

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

export function normalizePermissionDecision(
  value: unknown,
): 'allow' | 'deny' | 'ask' | 'passthrough' | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  if (normalized === 'allow' || normalized === 'approve') return 'allow'
  if (normalized === 'deny' || normalized === 'block') return 'deny'
  if (normalized === 'ask') return 'ask'
  if (normalized === 'passthrough' || normalized === 'continue')
    return 'passthrough'
  return null
}

export function normalizeStopDecision(
  value: unknown,
): 'approve' | 'block' | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  if (normalized === 'approve' || normalized === 'allow') return 'approve'
  if (normalized === 'block' || normalized === 'deny') return 'block'
  return null
}

export function getHookSystemMessage(
  json: Record<string, unknown>,
): string | null {
  const systemMessage = json.systemMessage
  return typeof systemMessage === 'string' && systemMessage.trim()
    ? systemMessage.trim()
    : null
}

export function getHookAdditionalContext(
  json: Record<string, unknown>,
): string | null {
  const hookSpecificOutput = asRecord(json.hookSpecificOutput)
  const additionalContext = hookSpecificOutput?.additionalContext
  return typeof additionalContext === 'string' && additionalContext.trim()
    ? additionalContext.trim()
    : null
}

export function getHookUpdatedInput(
  json: Record<string, unknown>,
): Record<string, unknown> | null {
  const hookSpecificOutput = asRecord(json.hookSpecificOutput)
  return asRecord(hookSpecificOutput?.updatedInput)
}

export function getHookPermissionDecision(
  json: Record<string, unknown>,
): 'allow' | 'deny' | 'ask' | 'passthrough' | null {
  const hookSpecificOutput = asRecord(json.hookSpecificOutput)
  return normalizePermissionDecision(hookSpecificOutput?.permissionDecision)
}

export function getHookStopDecision(
  json: Record<string, unknown>,
): 'approve' | 'block' | null {
  return normalizeStopDecision(json.decision)
}

export function getHookReason(json: Record<string, unknown>): string | null {
  const reason = json.reason
  return typeof reason === 'string' && reason.trim() ? reason.trim() : null
}
