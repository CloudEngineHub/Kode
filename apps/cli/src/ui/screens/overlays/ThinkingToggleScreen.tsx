import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Box, Text } from 'ink'
import figures from 'figures'

import { getTheme } from '#core/utils/theme'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { KEYPRESS_PRIORITY } from '#ui-ink/constants/keypressPriority'
import { ScreenFrame } from '#ui-ink/primitives/layout/ScreenFrame'
import { useScreenLayout } from '#ui-ink/primitives/layout/useScreenLayout'

type ThinkingToggleOption = {
  value: boolean
  label: string
  description: string
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function ThinkingToggleScreen({
  currentValue,
  isMidConversation,
  onSelect,
  onDone,
}: {
  currentValue: boolean
  isMidConversation: boolean
  onSelect: (value: boolean) => void
  onDone: () => void
}): React.ReactNode {
  const theme = getTheme()
  const layout = useScreenLayout()
  const exitState = { pending: false, keyName: null } as const

  const options: ThinkingToggleOption[] = useMemo(
    () => [
      {
        value: true,
        label: 'Enabled',
        description: 'The model will think before responding',
      },
      {
        value: false,
        label: 'Disabled',
        description: 'The model will respond without extended thinking',
      },
    ],
    [],
  )

  const initialIndex = currentValue ? 0 : 1
  const [selectedIndex, setSelectedIndex] = useState(initialIndex)

  useEffect(() => {
    setSelectedIndex(prev => clamp(prev, 0, Math.max(0, options.length - 1)))
  }, [options.length])

  const confirm = useCallback(() => {
    const option = options[selectedIndex]
    if (!option) return
    onSelect(option.value)
    onDone()
  }, [onDone, onSelect, options, selectedIndex])

  useKeypress(
    (input, key) => {
      const inputChar = input.length === 1 ? input : ''

      if (
        key.escape ||
        (key.ctrl && inputChar === 'c') ||
        (key.meta && inputChar === 't')
      ) {
        onDone()
        return true
      }

      if (key.return) {
        confirm()
        return true
      }

      if (key.upArrow || inputChar === 'k') {
        setSelectedIndex(prev =>
          clamp(prev - 1, 0, Math.max(0, options.length - 1)),
        )
        return true
      }

      if (key.downArrow || inputChar === 'j') {
        setSelectedIndex(prev =>
          clamp(prev + 1, 0, Math.max(0, options.length - 1)),
        )
        return true
      }

      return
    },
    { priority: KEYPRESS_PRIORITY.FULLSCREEN_OVERLAY },
  )

  const shortcutLine = '↑/↓ select · Enter confirm · Esc/Ctrl+C close'

  return (
    <ScreenFrame
      title="Toggle thinking mode"
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
          <Text dimColor wrap="truncate-end">
            Enable or disable thinking for this session.
          </Text>
          {isMidConversation && (
            <Text color={theme.warning}>
              Changing mid-conversation may reduce quality. For best results,
              set this at the start of a session.
            </Text>
          )}
        </Box>

        <Box flexDirection="column">
          {options.map((option, idx) => {
            const isSelected = idx === selectedIndex
            return (
              <Text
                key={option.label}
                color={isSelected ? theme.text : theme.secondaryText}
                bold={isSelected}
                wrap="truncate-end"
              >
                {isSelected ? figures.pointer : ' '} {option.label} —{' '}
                {option.description}
              </Text>
            )
          })}
        </Box>
      </Box>
    </ScreenFrame>
  )
}
