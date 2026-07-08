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
      preserveMissingFocusedValue?: boolean
    }

function getAdjacentSelectableValue(
  state: Pick<State, 'focusedValue' | 'optionMap'>,
  direction: 'next' | 'previous',
): string | undefined {
  if (!state.focusedValue) {
    return undefined
  }

  const item = state.optionMap.get(state.focusedValue)

  if (!item) {
    return undefined
  }

  let adjacent = direction === 'next' ? item.next : item.previous
  while (adjacent && !('value' in adjacent)) {
    adjacent = direction === 'next' ? adjacent.next : adjacent.previous
  }

  return adjacent && 'value' in adjacent ? adjacent.value : undefined
}

const reducer: Reducer<State, Action> = (state, action) => {
  switch (action.type) {
    case 'focus-next-option': {
      const nextValue = getAdjacentSelectableValue(state, 'next')

      if (!nextValue) {
        return state
      }

      const next = state.optionMap.get(nextValue)
      if (!next || !('value' in next)) return state

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
      const previousValue = getAdjacentSelectableValue(state, 'previous')

      if (!previousValue) {
        return state
      }

      const previous = state.optionMap.get(previousValue)
      if (!previous || !('value' in previous)) return state

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
      const preferredFocusedValue =
        state.focusedValue ?? state.value ?? action.defaultValue
      const nextState = createDefaultState({
        visibleOptionCount: action.visibleOptionCount,
        defaultValue: preferredFocusedValue,
        options: action.options,
      })
      const value =
        state.value && nextState.optionMap.get(state.value)
          ? state.value
          : undefined
      const focusedValue =
        action.preserveMissingFocusedValue &&
        state.focusedValue &&
        !nextState.optionMap.get(state.focusedValue)
          ? state.focusedValue
          : nextState.focusedValue

      return {
        ...nextState,
        focusedValue,
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
  const focusValueExists = useMemo(
    () =>
      Boolean(
        focusValue &&
        flatOptions.some(
          option => 'value' in option && option.value === focusValue,
        ),
      ),
    [flatOptions, focusValue],
  )

  const [state, dispatch] = useReducer(
    reducer,
    { visibleOptionCount, defaultValue: focusValue ?? defaultValue, options },
    createDefaultState,
  )
  const stateRef = useRef<State>(state)
  stateRef.current = state

  const structureKey = useMemo(
    () => optionStructureKey(flatOptions),
    [flatOptions],
  )
  const onChangeRef = useRef(onChange)
  const onFocusRef = useRef(onFocus)
  const lastFocusedValueRef = useRef<string | undefined>(state.focusedValue)
  const lastNotifiedFocusValueRef = useRef<string | undefined>(undefined)
  const lastSyncedRef = useRef({
    structureKey,
    visibleOptionCount,
  })

  const notifyFocus = useCallback((value: string | undefined) => {
    if (!value) return

    lastFocusedValueRef.current = value

    if (lastNotifiedFocusValueRef.current === value) return
    lastNotifiedFocusValueRef.current = value
    onFocusRef.current?.(value)
  }, [])

  const dispatchWithFocusMirror = useCallback(
    (action: Action) => {
      const previousState = stateRef.current
      const nextState = reducer(previousState, action)
      stateRef.current = nextState

      if (nextState.focusedValue !== previousState.focusedValue) {
        notifyFocus(nextState.focusedValue)
      }

      dispatch(action)
    },
    [notifyFocus],
  )

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    onFocusRef.current = onFocus
  }, [onFocus])

  useEffect(() => {
    notifyFocus(state.focusedValue)
  }, [notifyFocus, state.focusedValue])

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
    dispatchWithFocusMirror({
      type: 'sync-options',
      visibleOptionCount,
      defaultValue: lastFocusedValueRef.current ?? focusValue ?? defaultValue,
      options,
      preserveMissingFocusedValue: focusValue !== undefined,
    })
  }, [
    defaultValue,
    dispatchWithFocusMirror,
    focusValue,
    options,
    structureKey,
    visibleOptionCount,
  ])

  const focusNextOption = useCallback(() => {
    dispatchWithFocusMirror({
      type: 'focus-next-option',
    })
  }, [dispatchWithFocusMirror])

  const focusPreviousOption = useCallback(() => {
    dispatchWithFocusMirror({
      type: 'focus-previous-option',
    })
  }, [dispatchWithFocusMirror])

  const selectFocusedOption = useCallback(() => {
    dispatchWithFocusMirror({
      type: 'select-focused-option',
    })
  }, [dispatchWithFocusMirror])

  const selectOption = useCallback(
    (value: string) => {
      dispatchWithFocusMirror({
        type: 'select-option',
        value,
      })
    },
    [dispatchWithFocusMirror],
  )

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
        onChangeRef.current?.(selectedValue)
      } finally {
        dispatchWithFocusMirror({
          type: 'clear-selected-option',
          value: selectedValue,
        })
      }
    }
  }, [dispatchWithFocusMirror, state.previousValue, state.value])

  const appliedFocusValueRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!focusValue) {
      appliedFocusValueRef.current = undefined
      return
    }

    if (!focusValueExists) {
      return
    }

    if (appliedFocusValueRef.current === focusValue) return
    appliedFocusValueRef.current = focusValue
    dispatchWithFocusMirror({
      type: 'set-focus',
      value: focusValue,
    })
  }, [dispatchWithFocusMirror, focusValue, focusValueExists])

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
