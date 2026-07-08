import type { PermissionMode } from '#core/types/PermissionMode'
import type { PromptMode } from './types'
import { getPermissionModeStatusLabel } from '#ui-ink/utils/permissionModeDisplay'

export type InputModeDisplay = {
  label: string
  prefix: string
  statusText: string
  helperText: string
}

export function getInputModeDisplay(mode: PromptMode): InputModeDisplay {
  switch (mode) {
    case 'bash':
      return {
        label: 'Shell',
        prefix: '',
        statusText: 'Input: Shell',
        helperText: 'Esc back to chat',
      }
    case 'background':
      return {
        label: 'Background shell',
        prefix: '&',
        statusText: 'Input: Background shell',
        helperText: 'Esc back to chat',
      }
    case 'koding':
      return {
        label: 'Koding note',
        prefix: '#',
        statusText: 'Input: Koding note',
        helperText: 'Esc back to chat',
      }
    case 'prompt':
    default:
      return {
        label: 'Chat',
        prefix: '',
        statusText: 'Input: Chat',
        helperText: 'Ctrl+B shell · & background · # note',
      }
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

  parts.push(args.isLoading ? 'Enter send · Tab queue' : 'Enter send')

  if (args.pendingPromptCount > 0) {
    parts.push(`pending ${args.pendingPromptCount}`)
  }

  if (args.queuedPromptCount > 0) {
    parts.push(`queued ${args.queuedPromptCount}`)
    parts.push('Alt+Up edit')
  }

  return parts.join(' · ')
}
