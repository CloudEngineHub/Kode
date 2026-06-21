import React, { useState } from 'react'
import { Box, Text } from 'ink'
import figures from 'figures'
import { themeColor } from './colors'
import { COLOR_OPTIONS, type AgentColor } from './types'
import { useKeypress } from '#ui-ink/hooks/useKeypress'

export function ColorPicker(props: {
  agentName: string
  currentColor: AgentColor
  onConfirm: (color: AgentColor) => void
}) {
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
        const prefix = focused ? figures.pointer : ' '
        const label =
          color === 'automatic'
            ? 'Automatic color'
            : color.charAt(0).toUpperCase() + color.slice(1)
        return (
          <React.Fragment key={color}>
            <Text
              color={focused ? themeColor('suggestion') : undefined}
              bold={focused}
            >
              {prefix} {label}
            </Text>
          </React.Fragment>
        )
      })}
    </Box>
  )
}
