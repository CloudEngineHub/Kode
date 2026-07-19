import React, { useState } from 'react'
import { Box, Text } from 'ink'
import figures from 'figures'
import { getReadableTextColor, getTheme } from '#core/utils/theme'
import { resolveAgentColor } from '#ui-ink/utils/agentColor'
import { COLOR_OPTIONS, type AgentColor } from './types'
import { useKeypress } from '#ui-ink/hooks/useKeypress'

export function ColorPicker(props: {
  agentName: string
  currentColor: AgentColor
  onConfirm: (color: AgentColor) => void
}) {
  const theme = getTheme()
  const [index, setIndex] = useState(
    Math.max(
      0,
      COLOR_OPTIONS.findIndex(c => c === props.currentColor),
    ),
  )

  useKeypress((_input, key) => {
    if (key.upArrow) {
      setIndex(i => (i > 0 ? i - 1 : COLOR_OPTIONS.length - 1))
      return true
    }
    if (key.downArrow) {
      setIndex(i => (i < COLOR_OPTIONS.length - 1 ? i + 1 : 0))
      return true
    }
    if (key.return) {
      props.onConfirm(COLOR_OPTIONS[index] ?? 'automatic')
      return true
    }
  })

  return (
    <Box flexDirection="column" gap={1}>
      {COLOR_OPTIONS.map((color, i) => {
        const focused = i === index
        const pointer = focused ? `${figures.pointer} ` : '  '
        const swatchColor = resolveAgentColor(color) ?? theme.secondaryBorder
        const swatchTextColor = getReadableTextColor(swatchColor, theme.text)
        const focusedTextColor = getReadableTextColor(theme.kode, theme.text)
        const label =
          color === 'automatic'
            ? 'Automatic color'
            : color.charAt(0).toUpperCase() + color.slice(1)
        return (
          <Box
            key={color}
            width="100%"
            flexDirection="row"
            backgroundColor={focused ? theme.kode : undefined}
          >
            <Text
              color={focused ? focusedTextColor : theme.secondaryText}
              bold={focused}
            >
              {pointer}
            </Text>
            <Text backgroundColor={swatchColor} color={swatchTextColor} bold>
              {' '}
              {label}{' '}
            </Text>
            {focused ? <Text color={focusedTextColor}> selected</Text> : null}
          </Box>
        )
      })}
    </Box>
  )
}
