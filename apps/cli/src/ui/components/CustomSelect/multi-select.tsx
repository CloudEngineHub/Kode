import React, { type ReactNode, useMemo, useRef, useState } from 'react'
import { Box, Text, type DOMElement } from 'ink'
import figures from 'figures'
import { getTheme } from '#core/utils/theme'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { useMousePress, useMouseWheel } from '#ui-ink/hooks/useMouse'
import { useScopedIndexState } from '#ui-ink/hooks/useScopedIndexState'
import { getWindowedList } from '#ui-ink/primitives/list/windowedList'

export type MultiSelectOption = {
  readonly label: string
  readonly value: string
}

type SelectionSnapshot = {
  values: string[]
  updatedAt: number
}

const SELECTION_TTL_MS = 5_000
const selectionSnapshots = new Map<string, SelectionSnapshot>()

function clampIndex(value: number, itemCount: number): number {
  if (itemCount <= 0) return 0
  return Math.max(0, Math.min(Math.trunc(value), itemCount - 1))
}

function resolveInitialSelectedValues(args: {
  focusScope: string
  optionValues: Set<string>
  defaultValue: readonly string[]
}): string[] {
  const snapshot = selectionSnapshots.get(args.focusScope)
  if (snapshot && Date.now() - snapshot.updatedAt <= SELECTION_TTL_MS) {
    return snapshot.values.filter(value => args.optionValues.has(value))
  }

  return args.defaultValue.filter(value => args.optionValues.has(value))
}

function rememberSelection(args: {
  focusScope: string
  selectedValues: Iterable<string>
}): void {
  selectionSnapshots.set(args.focusScope, {
    values: Array.from(args.selectedValues),
    updatedAt: Date.now(),
  })
}

function MultiSelectRow({
  focused,
  selected,
  value,
  onPress,
  children,
}: {
  focused: boolean
  selected: boolean
  value: string
  onPress: (value: string) => void
  children: ReactNode
}) {
  const ref = useRef<DOMElement | null>(null)
  const theme = getTheme()

  useMousePress(
    ref,
    () => {
      onPress(value)
    },
    { priority: 20 },
  )

  return (
    <Box ref={ref} paddingLeft={2} paddingRight={1}>
      <Text color={focused ? theme.kode : undefined}>
        {focused ? figures.pointer : ' '}
      </Text>
      <Text color={selected ? theme.success : theme.secondaryText}>
        {selected ? figures.checkboxOn : figures.checkboxOff}
      </Text>
      <Text color={focused ? theme.kode : theme.text} wrap="truncate-end">
        {' '}
        {children}
      </Text>
    </Box>
  )
}

export function ScopedMultiSelect({
  focusScope,
  options,
  defaultValue = [],
  visibleOptionCount = 5,
  onSubmit,
  enableMouseWheel = true,
}: {
  readonly focusScope: string
  readonly options: readonly MultiSelectOption[]
  readonly defaultValue?: readonly string[]
  readonly visibleOptionCount?: number
  readonly onSubmit: (selectedValues: string[]) => void
  readonly enableMouseWheel?: boolean
}): React.ReactNode {
  const theme = getTheme()
  const containerRef = useRef<DOMElement | null>(null)
  const optionValues = useMemo(
    () => new Set(options.map(option => option.value)),
    [options],
  )
  const initialSelectedValues = useMemo(
    () =>
      resolveInitialSelectedValues({
        focusScope,
        optionValues,
        defaultValue,
      }),
    // Mount-time restore point. Later option/default changes are reconciled by
    // the effect below so short keep-alive remounts do not reset focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const [selectedValues, setSelectedValues] = useState<Set<string>>(
    () => new Set(initialSelectedValues),
  )
  const selectedValuesRef = useRef(selectedValues)
  selectedValuesRef.current = selectedValues

  const [focusedIndex, setFocusedIndex] = useScopedIndexState({
    scope: `${focusScope}:focus`,
    itemCount: Math.max(1, options.length),
  })

  React.useEffect(() => {
    setSelectedValues(prev => {
      const next = new Set(
        Array.from(prev).filter(value => optionValues.has(value)),
      )
      if (next.size === prev.size) {
        rememberSelection({ focusScope, selectedValues: prev })
        return prev
      }
      rememberSelection({ focusScope, selectedValues: next })
      return next
    })
  }, [focusScope, optionValues])

  const toggleValue = React.useCallback(
    (value: string) => {
      setSelectedValues(prev => {
        const next = new Set(prev)
        if (next.has(value)) next.delete(value)
        else next.add(value)
        rememberSelection({ focusScope, selectedValues: next })
        return next
      })
    },
    [focusScope],
  )

  const submit = React.useCallback(() => {
    const selected = selectedValuesRef.current
    onSubmit(
      options.filter(option => selected.has(option.value)).map(o => o.value),
    )
  }, [onSubmit, options])

  const maxVisible = Math.max(1, Math.min(visibleOptionCount, options.length))
  const window = useMemo(
    () =>
      getWindowedList({
        itemCount: options.length,
        focusIndex: focusedIndex,
        maxVisible,
        indicatorRows: 2,
      }),
    [focusedIndex, maxVisible, options.length],
  )
  const visibleOptions = useMemo(
    () => options.slice(window.start, window.end),
    [options, window.end, window.start],
  )

  useKeypress((input, key) => {
    if (options.length === 0) return

    const inputChar = input.length === 1 ? input : ''
    if (key.upArrow || inputChar === 'k') {
      setFocusedIndex(prev => clampIndex(prev - 1, options.length))
      return true
    }

    if (key.downArrow || inputChar === 'j') {
      setFocusedIndex(prev => clampIndex(prev + 1, options.length))
      return true
    }

    if (key.pageUp) {
      setFocusedIndex(prev =>
        clampIndex(prev - window.visibleCount, options.length),
      )
      return true
    }

    if (key.pageDown) {
      setFocusedIndex(prev =>
        clampIndex(prev + window.visibleCount, options.length),
      )
      return true
    }

    if (key.home || inputChar === 'g') {
      setFocusedIndex(0)
      return true
    }

    if (key.end || inputChar === 'G') {
      setFocusedIndex(Math.max(0, options.length - 1))
      return true
    }

    if (input === ' ') {
      const option = options[focusedIndex]
      if (option) toggleValue(option.value)
      return true
    }

    if (key.return) {
      submit()
      return true
    }
  })

  useMouseWheel(
    containerRef,
    direction => {
      setFocusedIndex(prev =>
        clampIndex(prev + (direction === 'up' ? -1 : 1), options.length),
      )
    },
    { isActive: enableMouseWheel && options.length > 0, priority: 10 },
  )

  if (options.length === 0) {
    return <Text color={theme.secondaryText}>No options.</Text>
  }

  const topIndicator = window.showUpIndicator ? `${figures.arrowUp} More` : ' '
  const bottomIndicator = window.showDownIndicator
    ? `${figures.arrowDown} More`
    : ' '

  return (
    <Box ref={containerRef} flexDirection="column">
      <Text dimColor wrap="truncate-end">
        {topIndicator}
      </Text>
      {visibleOptions.map((option, index) => {
        const absoluteIndex = window.start + index
        return (
          <MultiSelectRow
            key={option.value}
            focused={absoluteIndex === focusedIndex}
            selected={selectedValues.has(option.value)}
            value={option.value}
            onPress={value => {
              setFocusedIndex(absoluteIndex)
              toggleValue(value)
            }}
          >
            {option.label}
          </MultiSelectRow>
        )
      })}
      <Text dimColor wrap="truncate-end">
        {bottomIndicator}
      </Text>
    </Box>
  )
}
