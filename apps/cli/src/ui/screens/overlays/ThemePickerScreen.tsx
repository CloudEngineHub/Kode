import React, { useCallback, useMemo, useRef, useState } from 'react'
import { Box, Text } from 'ink'
import figures from 'figures'
import type { ThemeNames } from '#core/utils/theme'
import { getTheme } from '#core/utils/theme'
import { getGlobalConfig, saveGlobalConfig } from '#core/utils/config'
import TextInput from '#ui-ink/components/TextInput'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { KEYPRESS_PRIORITY } from '#ui-ink/constants/keypressPriority'
import { ScreenFrame } from '#ui-ink/primitives/layout/ScreenFrame'
import { useScreenLayout } from '#ui-ink/primitives/layout/useScreenLayout'
import { getWindowedList } from '#ui-ink/primitives/list/windowedList'
import { PressableRow } from '#ui-ink/primitives/list/PressableRow'
import { useScopedIndexState } from '#ui-ink/hooks/useScopedIndexState'

type Props = {
  onDone: (result?: string) => void
}

// Theme display names for better UX
const THEME_LABELS: Record<ThemeNames, string> = {
  // Light themes
  light: 'Light',
  'light-daltonized': 'Light (Colorblind)',
  'solarized-light': 'Solarized Light',
  'github-light': 'GitHub Light',
  // Dark themes
  dark: 'Dark',
  'dark-daltonized': 'Dark (Colorblind)',
  dracula: 'Dracula',
  nord: 'Nord',
  monokai: 'Monokai',
  'tokyo-night': 'Tokyo Night',
  catppuccin: 'Catppuccin',
  gruvbox: 'Gruvbox',
  'one-dark': 'One Dark',
  'solarized-dark': 'Solarized Dark',
}

// Organized theme list: light themes first, then dark themes
const THEME_OPTIONS: ThemeNames[] = [
  // Light
  'light',
  'light-daltonized',
  'solarized-light',
  'github-light',
  // Dark
  'dark',
  'dark-daltonized',
  'dracula',
  'nord',
  'monokai',
  'tokyo-night',
  'catppuccin',
  'gruvbox',
  'one-dark',
  'solarized-dark',
]

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function matchesTheme(name: ThemeNames, query: string): boolean {
  if (!query) return true
  return `${name} ${THEME_LABELS[name] ?? name}`.toLowerCase().includes(query)
}

export function ThemePickerScreen({ onDone }: Props): React.ReactNode {
  const theme = getTheme()
  const layout = useScreenLayout()
  const exitState = { pending: false, keyName: null } as const
  const didDoneRef = useRef(false)

  const safeOnDone = useCallback(
    (result?: string) => {
      if (didDoneRef.current) return
      didDoneRef.current = true
      onDone(result)
    },
    [onDone],
  )

  const currentTheme = (getGlobalConfig().theme ?? 'dark') as ThemeNames
  const [filterQuery, setFilterQuery] = useState('')
  const [filterCursorOffset, setFilterCursorOffset] = useState(0)
  const [filterOpen, setFilterOpen] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const normalizedFilter = filterQuery.trim().toLowerCase()
  const filteredThemes = useMemo(
    () => THEME_OPTIONS.filter(name => matchesTheme(name, normalizedFilter)),
    [normalizedFilter],
  )
  const initialIndex = useMemo(() => {
    const index = filteredThemes.indexOf(currentTheme)
    return index >= 0 ? index : 0
  }, [currentTheme, filteredThemes])
  const [selectedIndex, setSelectedIndex] = useScopedIndexState({
    scope: 'theme-picker',
    itemCount: filteredThemes.length,
    initialIndex,
  })

  const reservedRows =
    (layout.tightLayout ? 7 : layout.compactLayout ? 9 : 11) +
    (filterOpen ? 2 : 0) +
    layout.paddingY * 2 +
    layout.gap * 3
  const maxVisible = Math.max(3, layout.rows - reservedRows)
  const window = useMemo(
    () =>
      getWindowedList({
        itemCount: filteredThemes.length,
        focusIndex: selectedIndex,
        maxVisible,
        indicatorRows: 2,
      }),
    [filteredThemes.length, maxVisible, selectedIndex],
  )
  const visibleThemes = useMemo(
    () => filteredThemes.slice(window.start, window.end),
    [filteredThemes, window.end, window.start],
  )

  const updateFilter = useCallback(
    (nextValue: string) => {
      setFilterQuery(nextValue)
      setFilterCursorOffset(nextValue.length)
      setSelectedIndex(0)
      setStatus(null)
    },
    [setSelectedIndex],
  )

  const selectThemeAtIndex = useCallback(
    (index: number) => {
      const selected = filteredThemes[index]
      setSelectedIndex(index)
      if (!selected) {
        setStatus('No matching themes')
        return
      }
      saveGlobalConfig({ ...getGlobalConfig(), theme: selected })
      safeOnDone(`Theme set to ${selected}`)
    },
    [filteredThemes, safeOnDone, setSelectedIndex],
  )

  const confirm = useCallback(() => {
    selectThemeAtIndex(selectedIndex)
  }, [selectThemeAtIndex, selectedIndex])

  useKeypress(
    (input, key) => {
      const inputChar = input.length === 1 ? input : ''
      const lowerInputChar = inputChar.toLowerCase()
      const typedInput =
        key.insertable && !key.ctrl && !key.meta && input.length > 0
          ? input
          : ''

      if (key.ctrl && lowerInputChar === 'c') {
        safeOnDone('Theme picker dismissed')
        return true
      }

      if (key.escape) {
        if (filterOpen && filterQuery.length > 0) {
          updateFilter('')
          return true
        }
        if (filterOpen) {
          setFilterOpen(false)
          return true
        }
        safeOnDone('Theme picker dismissed')
        return true
      }

      if (
        !filterOpen &&
        (typedInput === '/' || (key.ctrl && lowerInputChar === 'f'))
      ) {
        setFilterOpen(true)
        return true
      }

      if (filterOpen && (key.backspace || key.delete || typedInput)) {
        return false
      }

      if (key.return) {
        confirm()
        return true
      }

      if (key.upArrow || (!filterOpen && inputChar === 'k')) {
        setSelectedIndex(prev =>
          clamp(prev - 1, 0, Math.max(0, filteredThemes.length - 1)),
        )
        return true
      }
      if (key.downArrow || (!filterOpen && inputChar === 'j')) {
        setSelectedIndex(prev =>
          clamp(prev + 1, 0, Math.max(0, filteredThemes.length - 1)),
        )
        return true
      }

      if (!filterOpen && typedInput) {
        setFilterOpen(true)
        updateFilter(typedInput)
        return true
      }

      return
    },
    { priority: KEYPRESS_PRIORITY.FULLSCREEN_OVERLAY },
  )

  const shortcutLine = filterOpen
    ? 'Type to filter · ↑/↓ select · Enter apply · Esc clear/back'
    : 'Type or / to filter · ↑/↓ or j/k select · Enter apply · Esc close'
  const statusText =
    status ??
    (filterOpen
      ? `${filteredThemes.length} match${
          filteredThemes.length === 1 ? '' : 'es'
        } · Enter applies the highlighted theme`
      : `Current: ${THEME_LABELS[currentTheme] ?? currentTheme}`)
  const topIndicator = window.showUpIndicator
    ? `${figures.arrowUp} ${window.start} above`
    : ' '
  const bottomIndicator = window.showDownIndicator
    ? `${figures.arrowDown} ${filteredThemes.length - window.end} below`
    : ' '

  return (
    <ScreenFrame
      title="Theme"
      exitState={exitState}
      paddingX={layout.paddingX}
      paddingY={layout.paddingY}
      gap={layout.gap}
    >
      <Box flexDirection="column" gap={layout.gap}>
        <Text dimColor wrap="truncate-end">
          {shortcutLine}
        </Text>

        <Text
          color={
            filteredThemes.length === 0 ? theme.warning : theme.secondaryText
          }
          wrap="truncate-end"
        >
          {statusText}
        </Text>

        {filterOpen ? (
          <Box flexDirection="row">
            <Text color={theme.kode}>Filter: </Text>
            <TextInput
              value={filterQuery}
              onChange={updateFilter}
              placeholder="theme name"
              columns={Math.max(1, layout.columns - layout.paddingX * 2 - 8)}
              cursorOffset={filterCursorOffset}
              onChangeCursorOffset={setFilterCursorOffset}
              showCursor={true}
              focus={true}
              disableCursorMovementForUpDownKeys={true}
            />
          </Box>
        ) : null}

        <Box flexDirection="column" width="100%">
          <Text dimColor wrap="truncate-end">
            {topIndicator}
          </Text>
          {visibleThemes.length > 0 ? (
            visibleThemes.map((name, index) => {
              const absoluteIndex = window.start + index
              const isSelected = absoluteIndex === selectedIndex
              const isCurrent = name === currentTheme
              return (
                <PressableRow
                  key={name}
                  width="100%"
                  onPress={() => selectThemeAtIndex(absoluteIndex)}
                >
                  <Text color={isSelected ? theme.kode : theme.secondaryText}>
                    {isSelected ? figures.pointer : ' '}
                  </Text>
                  <Box flexGrow={1} overflow="hidden">
                    <Text
                      color={isSelected ? theme.text : theme.secondaryText}
                      bold={isSelected || isCurrent}
                      wrap="truncate-end"
                    >
                      {` ${THEME_LABELS[name] ?? name}`}
                    </Text>
                  </Box>
                  {isCurrent ? (
                    <Text color={theme.kode} wrap="truncate-end">
                      {' [current]'}
                    </Text>
                  ) : null}
                </PressableRow>
              )
            })
          ) : (
            <Text color={theme.warning} wrap="truncate-end">
              No matching themes. Esc clears the filter.
            </Text>
          )}
          <Text dimColor wrap="truncate-end">
            {bottomIndicator}
          </Text>
        </Box>
      </Box>
    </ScreenFrame>
  )
}
