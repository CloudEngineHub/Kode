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
    (input, key) => {
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

      if (key.insertable && !key.ctrl && !key.meta && /^[1-9]$/.test(input)) {
        const selectableOptionIndex = Number.parseInt(input, 10) - 1
        const option = state.visibleOptions.filter(
          visibleOption => 'value' in visibleOption,
        )[selectableOptionIndex]

        if (option && 'value' in option) {
          state.selectOption(option.value)
        }

        return true
      }
    },
    { isActive: !isDisabled },
  )
}
