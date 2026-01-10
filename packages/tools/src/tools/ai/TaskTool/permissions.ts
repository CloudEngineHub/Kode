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

  if (
    options.agentPermissionMode === 'bypassPermissions' &&
    (options.safeMode || base.isBypassPermissionsModeAvailable !== true)
  ) {
    return { ...base, mode: 'default' }
  }

  return { ...base, mode: options.agentPermissionMode }
}
