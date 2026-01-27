import { Box, Text } from 'ink'
import React from 'react'
import { useInterval } from '#ui-ink/hooks/useInterval'
import { getTheme } from '#core/utils/theme'
import {
  CHECKMARK,
  CROSS,
  DIAMOND_HOLLOW,
  DIAMOND_FILLED,
} from '#core/constants/figures'

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

type Props = {
  isError: boolean
  isUnresolved: boolean
  shouldAnimate: boolean
}

export function ToolUseLoader({
  isError,
  isUnresolved,
  shouldAnimate,
}: Props): React.ReactNode {
  const [frameIndex, setFrameIndex] = React.useState(0)

  useInterval(() => {
    if (!shouldAnimate) {
      return
    }
    setFrameIndex(i => (i + 1) % SPINNER_FRAMES.length)
  }, 80)

  const theme = getTheme()

  if (shouldAnimate) {
    return (
      <Box minWidth={2}>
        <Text color={theme.kode}>{SPINNER_FRAMES[frameIndex]} </Text>
      </Box>
    )
  }

  if (isError) {
    return (
      <Box minWidth={2}>
        <Text color={theme.error}>{CROSS} </Text>
      </Box>
    )
  }

  if (isUnresolved) {
    return (
      <Box minWidth={2}>
        <Text color={theme.secondaryText}>{DIAMOND_HOLLOW} </Text>
      </Box>
    )
  }

  return (
    <Box minWidth={2}>
      <Text color="green">{CHECKMARK} </Text>
    </Box>
  )
}
