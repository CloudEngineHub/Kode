import type { PermissionMode } from '#core/types/PermissionMode'
import type { PromptMode } from './types'
import { getPermissionModeStatusLabel } from '#ui-ink/utils/permissionModeDisplay'
import { getPromptModeSpec } from './promptModeSpecs'

export type InputModeDisplay = {
  label: string
  prefix: string
  statusText: string
  helperText: string
}

export function getInputModeDisplay(mode: PromptMode): InputModeDisplay {
  const spec = getPromptModeSpec(mode)
  return {
    label: spec.label,
    prefix: spec.prefix,
    statusText: spec.statusText,
    helperText: spec.helperText,
  }
}

export function buildPromptInputStatusLine(args: {
  mode: PromptMode
  permissionMode: PermissionMode
  modeCycleShortcutText: string
  isLoading: boolean
  pendingPromptCount: number
  queuedPromptCount: number
  editorMode?: string
  vimMode?: 'INSERT' | 'NORMAL'
}): string {
  const inputMode = getInputModeDisplay(args.mode)
  const parts = [
    inputMode.statusText,
    inputMode.helperText,
    `Tools: ${getPermissionModeStatusLabel(args.permissionMode)} (${args.modeCycleShortcutText})`,
  ]

  if (args.editorMode === 'vim' && args.vimMode === 'INSERT') {
    parts.unshift('-- INSERT --')
  }

  parts.push(args.isLoading ? 'Enter send \u00b7 Tab queue' : 'Enter send')

  if (args.pendingPromptCount > 0) {
    parts.push(`pending ${args.pendingPromptCount}`)
  }

  if (args.queuedPromptCount > 0) {
    parts.push(`queued ${args.queuedPromptCount}`)
    parts.push('Alt+Up edit')
  }

  return parts.join(' \u00b7 ')
}
