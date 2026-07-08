import {
  useReducer,
  type Reducer,
  useCallback,
  useMemo,
  useRef,
  useEffect,
} from 'react'
import OptionMap from './option-map'
import { Option } from '@inkjs/ui'
import type { OptionHeader, OptionSubtree } from './select'
import {
  createDefaultState,
  flattenOptions,
  type DefaultSelectState,
} from './select-state'

type State = DefaultSelectState

function optionStructureKey(
  options: ReturnType<typeof flattenOptions>,
): string {
  return JSON.stringify(
    options.map(option =>
      'value' in option
        ? ['option', option.value]
        : ['header', option.optionValues],
    ),
  )
}

type Action =
  | { type: 'focus-next-option' }
  | { type: 'focus-previous-option' }
  | { type: 'select-focused-option' }
  | { type: 'select-option'; value: string }
  | { type: 'clear-selected-option'; value: string }
  | { type: 'set-focus'; value: string }
  | {
      type: 'sync-options'
      visibleOptionCount: number
      options: (Option | OptionSubtree)[]
      defaultValue?: string
    }

const reducer: Reducer<State, Action> = (state, action) => {
  switch (action.type) {
    case 'focus-next-option': {
      if (!state.focusedValue) {
        return state
      }

      const item = state.optionMap.get(state.focusedValue)

      if (!item) {
        return state
      }

      let next = item.next
      while (next && !('value' in next)) {
        // Skip headers
        next = next.next
      }

      if (!next || !('value' in next)) {
        return state
      }

      const needsToScroll = next.index >= state.visibleToIndex

      if (!needsToScroll) {
        return {
          ...state,
          focusedValue: next.value,
        }
      }

      const nextVisibleToIndex = Math.min(
        state.optionMap.size,
        state.visibleToIndex + 1,
      )

      const nextVisibleFromIndex = nextVisibleToIndex - state.visibleOptionCount

      return {
        ...state,
        focusedValue: next.value,
        visibleFromIndex: nextVisibleFromIndex,
        visibleToIndex: nextVisibleToIndex,
      }
    }

    case 'focus-previous-option': {
      if (!state.focusedValue) {
        return state
      }

      const item = state.optionMap.get(state.focusedValue)

      if (!item) {
        return state
      }

      let previous = item.previous
      while (previous && !('value' in previous)) {
        // Skip headers
        previous = previous.previous
      }

      if (!previous || !('value' in previous)) {
        return state
      }

      const needsToScroll = previous.index <= state.visibleFromIndex

      if (!needsToScroll) {
        return {
          ...state,
          focusedValue: previous.value,
        }
      }

      const nextVisibleFromIndex = Math.max(0, state.visibleFromIndex - 1)

      const nextVisibleToIndex = nextVisibleFromIndex + state.visibleOptionCount

      return {
        ...state,
        focusedValue: previous.value,
        visibleFromIndex: nextVisibleFromIndex,
        visibleToIndex: nextVisibleToIndex,
      }
    }

    case 'select-focused-option': {
      return {
        ...state,
        previousValue: state.value,
        value: state.focusedValue,
      }
    }

    case 'select-option': {
      if (!state.optionMap.get(action.value)) return state

      return {
        ...state,
        focusedValue: action.value,
        previousValue: state.value,
        value: action.value,
      }
    }

    case 'clear-selected-option': {
      if (state.value !== action.value) return state

      return {
        ...state,
        previousValue: action.value,
        value: undefined,
      }
    }

    case 'sync-options': {
      const nextState = createDefaultState({
        visibleOptionCount: action.visibleOptionCount,
        defaultValue: state.focusedValue ?? state.value ?? action.defaultValue,
        options: action.options,
      })
      const value =
        state.value && nextState.optionMap.get(state.value)
          ? state.value
          : undefined

      return {
        ...nextState,
        previousValue: value === state.value ? state.previousValue : undefined,
        value,
      }
    }

    case 'set-focus': {
      if (!state.optionMap.get(action.value)) return state
      if (state.focusedValue === action.value) return state

      return {
        ...state,
        focusedValue: action.value,
      }
    }
  }
}

export type UseSelectStateProps = {
  /**
   * Number of items to display.
   *
   * @default 5
   */
  visibleOptionCount?: number

  /**
   * Options.
   */
  options: (Option | OptionSubtree)[]

  /**
   * Initially selected option's value.
   */
  defaultValue?: string

  /**
   * Callback for selecting an option.
   */
  onChange?: (value: string) => void

  /**
   * Callback for focusing an option.
   */
  onFocus?: (value: string) => void

  /**
   * Value to focus
   */
  focusValue?: string
}

export type SelectState = Pick<
  State,
  'focusedValue' | 'visibleFromIndex' | 'visibleToIndex' | 'value'
> & {
  /**
   * Visible options.
   */
  visibleOptions: Array<(Option | OptionHeader) & { index: number }>

  /**
   * Focus next option and scroll the list down, if needed.
   */
  focusNextOption: () => void

  /**
   * Focus previous option and scroll the list up, if needed.
   */
  focusPreviousOption: () => void

  /**
   * Select currently focused option.
   */
  selectFocusedOption: () => void

  /**
   * Select an option by value.
   */
  selectOption: (value: string) => void
}

export const useSelectState = ({
  visibleOptionCount = 5,
  options,
  defaultValue,
  onChange,
  onFocus,
  focusValue,
}: UseSelectStateProps) => {
  const flatOptions = useMemo(() => flattenOptions(options), [options])

  const [state, dispatch] = useReducer(
    reducer,
    { visibleOptionCount, defaultValue, options },
    createDefaultState,
  )

  const structureKey = useMemo(
    () => optionStructureKey(flatOptions),
    [flatOptions],
  )
  const lastSyncedRef = useRef({
    structureKey,
    visibleOptionCount,
  })

  useEffect(() => {
    const lastSynced = lastSyncedRef.current
    if (
      lastSynced.structureKey === structureKey &&
      lastSynced.visibleOptionCount === visibleOptionCount
    ) {
      return
    }

    lastSyncedRef.current = {
      structureKey,
      visibleOptionCount,
    }
    dispatch({
      type: 'sync-options',
      visibleOptionCount,
      defaultValue,
      options,
    })
  }, [defaultValue, options, structureKey, visibleOptionCount])

  const focusNextOption = useCallback(() => {
    dispatch({
      type: 'focus-next-option',
    })
  }, [])

  const focusPreviousOption = useCallback(() => {
    dispatch({
      type: 'focus-previous-option',
    })
  }, [])

  const selectFocusedOption = useCallback(() => {
    dispatch({
      type: 'select-focused-option',
    })
  }, [])

  const selectOption = useCallback((value: string) => {
    dispatch({
      type: 'select-option',
      value,
    })
  }, [])

  const visibleOptions = useMemo(() => {
    return flatOptions
      .map((option, index) => ({
        ...option,
        index,
      }))
      .slice(state.visibleFromIndex, state.visibleToIndex)
  }, [flatOptions, state.visibleFromIndex, state.visibleToIndex])

  useEffect(() => {
    if (state.value && state.previousValue !== state.value) {
      const selectedValue = state.value
      try {
        onChange?.(selectedValue)
      } finally {
        dispatch({
          type: 'clear-selected-option',
          value: selectedValue,
        })
      }
    }
  }, [state.previousValue, state.value, onChange])

  useEffect(() => {
    if (state.focusedValue) {
      onFocus?.(state.focusedValue)
    }
  }, [state.focusedValue, onFocus])

  useEffect(() => {
    if (focusValue) {
      dispatch({
        type: 'set-focus',
        value: focusValue,
      })
    }
  }, [focusValue])

  return {
    focusedValue: state.focusedValue,
    visibleFromIndex: state.visibleFromIndex,
    visibleToIndex: state.visibleToIndex,
    value: state.value,
    visibleOptions,
    focusNextOption,
    focusPreviousOption,
    selectFocusedOption,
    selectOption,
  }
}
