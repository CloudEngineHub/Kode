import type { PermissionMode } from '#core/types/PermissionMode'

import type * as Protocol from '../protocol'

const MODE_SET: ReadonlySet<PermissionMode> = new Set([
  'default',
  'acceptEdits',
  'plan',
  'dontAsk',
  'bypassPermissions',
])

export function isPermissionMode(value: unknown): value is PermissionMode {
  return typeof value === 'string' && MODE_SET.has(value as PermissionMode)
}

export function coercePermissionMode(value: unknown): PermissionMode {
  return isPermissionMode(value) ? value : 'default'
}

export function getModeState(
  currentModeId: unknown,
): Protocol.SessionModeState {
  const availableModes: Protocol.SessionMode[] = [
    {
      id: 'default',
      name: 'Default',
      description: 'Normal permissions (prompt when needed)',
    },
    {
      id: 'acceptEdits',
      name: 'Accept Edits',
      description: 'Auto-approve safe file edits',
    },
    { id: 'plan', name: 'Plan', description: 'Read-only planning mode' },
    {
      id: 'dontAsk',
      name: "Don't Ask",
      description: 'Auto-deny permission prompts',
    },
    {
      id: 'bypassPermissions',
      name: 'Bypass',
      description: 'Bypass permission prompts (dangerous)',
    },
  ]

  const current = coercePermissionMode(currentModeId)
  return { currentModeId: current, availableModes }
}
