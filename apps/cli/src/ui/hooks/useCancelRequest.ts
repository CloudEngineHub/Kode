import { ToolUseConfirm } from '#ui-ink/components/permissions/PermissionRequest'
import { BinaryFeedbackContext } from '#ui-ink/screens/REPL'
import type { SetToolJSXFn } from '#core/tooling/Tool'
import type { ReactNode } from 'react'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { KEYPRESS_PRIORITY } from '#ui-ink/constants/keypressPriority'

export function useCancelRequest(
  setToolJSX: SetToolJSXFn<ReactNode>,
  setToolUseConfirm: (toolUseConfirm: ToolUseConfirm | null) => void,
  setBinaryFeedbackContext: (bfContext: BinaryFeedbackContext | null) => void,
  onCancel: () => void,
  isLoading: boolean,
  isMessageSelectorVisible: boolean,
  abortSignal?: AbortSignal,
) {
  useKeypress(
    (_, key) => {
      if (!key.escape) {
        return
      }
      if (abortSignal?.aborted) {
        return
      }
      if (!abortSignal) {
        return
      }
      if (!isLoading) {
        return
      }
      if (isMessageSelectorVisible) {
        // Esc closes the message selector
        return
      }

      setToolJSX(null)
      setToolUseConfirm(null)
      setBinaryFeedbackContext(null)
      onCancel()
      return true
    },
    { priority: KEYPRESS_PRIORITY.REPL_CONTROLLER + 1 },
  )
}
