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
      }

      if (key.upArrow) {
        state.focusPreviousOption()
      }

      if (key.return) {
        state.selectFocusedOption()
      }
    },
    { isActive: !isDisabled },
  )
}
