import type { PermissionMode } from '#core/types/PermissionMode'
import type { ToolPermissionContext } from '#core/types/toolPermissionContext'
import type { AgentPermissionMode } from '#core/utils/agentLoader'

export function normalizeAgentPermissionMode(
  mode: AgentPermissionMode | undefined,
): PermissionMode | undefined {
  if (!mode) return undefined
  if (mode === 'delegate') return 'default'
  if (
    mode === 'default' ||
    mode === 'acceptEdits' ||
    mode === 'plan' ||
    mode === 'bypassPermissions' ||
    mode === 'dontAsk'
  ) {
    return mode
  }
  return undefined
}

export function applyAgentPermissionMode(
  base: ToolPermissionContext | undefined,
  options: {
    agentPermissionMode: PermissionMode | undefined
    safeMode: boolean
  },
): ToolPermissionContext | undefined {
  if (!base) return base
  if (!options.agentPermissionMode) return base

  const rank = (mode: PermissionMode): number => {
    switch (mode) {
      case 'dontAsk':
        return 0
      case 'plan':
        return 1
      case 'default':
        return 2
      case 'acceptEdits':
        return 3
      case 'bypassPermissions':
        return 4
    }
  }

  let nextMode: PermissionMode = options.agentPermissionMode

  if (
    nextMode === 'bypassPermissions' &&
    (options.safeMode || base.isBypassPermissionsModeAvailable !== true)
  ) {
    nextMode = 'default'
  }

  // Subagents must not auto-escalate permission mode beyond the parent context.
  // They may narrow permissions (e.g. default -> plan), but must not loosen them
  // (e.g. plan -> acceptEdits/bypassPermissions) without an explicit user flow.
  if (rank(nextMode) > rank(base.mode)) return base

  if (nextMode === base.mode) return base
  return { ...base, mode: nextMode }
}
