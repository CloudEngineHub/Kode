import type { ToolKeypressHandler } from '@kode/tool-interface/Tool'
import { KEYPRESS_PRIORITY } from '#ui-ink/constants/keypressPriority'
import { useKeypress } from '#ui-ink/hooks/useKeypress'

export function useToolKeypress(handler?: ToolKeypressHandler): void {
  useKeypress((input, key) => handler?.(input, key) === true, {
    isActive: handler !== undefined,
    priority: KEYPRESS_PRIORITY.INLINE_TOOL,
  })
}
