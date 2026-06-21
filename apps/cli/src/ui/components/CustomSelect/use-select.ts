import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { type SelectState } from './use-select-state'

export type UseSelectProps = {
  /**
   * When disabled, user input is ignored.
   *
   * @default false
   */
  isDisabled?: boolean

  /**
   * Select state.
   */
  state: SelectState
}

export const useSelect = ({ isDisabled = false, state }: UseSelectProps) => {
  useKeypress(
    (_input, key) => {
      if (key.downArrow) {
        state.focusNextOption()
        return true
      }

      if (key.upArrow) {
        state.focusPreviousOption()
        return true
      }

      if (key.return) {
        state.selectFocusedOption()
        return true
      }
    },
    { isActive: !isDisabled },
  )
}
