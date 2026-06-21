import React, { useCallback, useMemo, useRef, useState } from 'react'
import { Box, Text } from 'ink'
import figures from 'figures'
import type { ThemeNames } from '#core/utils/theme'
import { getTheme, getAvailableThemes } from '#core/utils/theme'
import { getGlobalConfig, saveGlobalConfig } from '#core/utils/config'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { ScreenFrame } from '#ui-ink/primitives/layout/ScreenFrame'
import { useScreenLayout } from '#ui-ink/primitives/layout/useScreenLayout'

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

  const initialTheme = getGlobalConfig().theme ?? 'dark'
  const initialIndex = Math.max(0, THEME_OPTIONS.indexOf(initialTheme))
  const [selectedIndex, setSelectedIndex] = useState(initialIndex)

  const applySelectedTheme = useCallback(() => {
    const selected = THEME_OPTIONS[selectedIndex] ?? 'dark'
    saveGlobalConfig({ ...getGlobalConfig(), theme: selected })
    safeOnDone(`Theme set to ${selected}`)
  }, [safeOnDone, selectedIndex])

  useKeypress((input, key) => {
    const inputChar = input.length === 1 ? input : ''

    if (key.escape || (key.ctrl && inputChar === 'c')) {
      safeOnDone('Theme picker dismissed')
      return true
    }

    if (key.upArrow || inputChar === 'k') {
      setSelectedIndex(prev => clamp(prev - 1, 0, THEME_OPTIONS.length - 1))
      return true
    }
    if (key.downArrow || inputChar === 'j') {
      setSelectedIndex(prev => clamp(prev + 1, 0, THEME_OPTIONS.length - 1))
      return true
    }

    if (key.return) {
      applySelectedTheme()
      return true
    }
  })

  const shortcutLine = '↑/↓ select · Enter set · Esc cancel'

  const options = useMemo(() => THEME_OPTIONS, [])

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

        <Box flexDirection="column">
          {options.map((name, idx) => {
            const isSelected = idx === selectedIndex
            return (
              <Text
                key={name}
                color={isSelected ? theme.text : theme.secondaryText}
                bold={isSelected}
                wrap="truncate-end"
              >
                {isSelected ? figures.pointer : ' '}{' '}
                {THEME_LABELS[name] ?? name}
              </Text>
            )
          })}
        </Box>
      </Box>
    </ScreenFrame>
  )
}
