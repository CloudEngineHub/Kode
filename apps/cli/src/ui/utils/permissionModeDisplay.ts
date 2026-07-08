import type { PermissionMode } from '#core/types/PermissionMode'
import { normalizePermissionMode } from '#core/types/PermissionMode'

export function getPermissionModeStatusLabel(mode: PermissionMode): string {
  switch (normalizePermissionMode(mode)) {
    case 'plan':
      return 'Plan first'
    case 'acceptEdits':
      return 'Auto-accept edits'
    case 'bypassPermissions':
      return 'Bypass permissions'
    case 'dontAsk':
      return 'Deny new tools'
    case 'cautious':
      return 'Ask before tools'
    case 'yolo':
      return 'Auto-run safe tools'
    default:
      return 'Ask before tools'
  }
}

export function getPermissionModeDetail(mode: PermissionMode): string {
  switch (normalizePermissionMode(mode)) {
    case 'plan':
      return 'review plans before implementation'
    case 'acceptEdits':
      return 'edits accepted automatically'
    case 'bypassPermissions':
      return 'tool prompts bypassed'
    case 'dontAsk':
      return 'new tool requests denied'
    case 'cautious':
      return 'ask before tool use'
    case 'yolo':
      return 'safe tools can run without prompts'
    default:
      return 'ask before tool use'
  }
}
