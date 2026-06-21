import React, { useState, useEffect } from 'react'
import { Box, Text } from 'ink'
import { getTheme } from '#core/utils/theme'
import { applyMarkdown } from '#core/utils/markdown'
import {
  ThinkingBlock,
  ThinkingBlockParam,
} from '@anthropic-ai/sdk/resources/index.mjs'
import { BULLET } from '#core/constants/figures'

const PROGRESS_FRAMES = ['/', '-', '\\', '|']

type Props = {
  param: ThinkingBlock | ThinkingBlockParam
  addMargin: boolean
}

export function AssistantThinkingMessage({
  param: { thinking },
  addMargin = false,
}: Props): React.ReactNode {
  const [progressFrame, setProgressFrame] = useState(0)
  const theme = getTheme()

  useEffect(() => {
    const timer = setInterval(() => {
      setProgressFrame(f => (f + 1) % PROGRESS_FRAMES.length)
    }, 150)
    return () => clearInterval(timer)
  }, [])

  if (!thinking || thinking.trim().length === 0) {
    return null
  }

  return (
    <Box
      flexDirection="column"
      gap={1}
      marginTop={addMargin ? 1 : 0}
      width="100%"
    >
      <Text>
        <Text color={theme.kode}>{BULLET}</Text>
        <Text color={theme.text}>
          {' '}
          [Thinking {PROGRESS_FRAMES[progressFrame]}]
        </Text>
      </Text>
      <Box paddingLeft={2}>
        <Text color={theme.secondaryText} italic>
          {applyMarkdown(thinking)}
        </Text>
      </Box>
    </Box>
  )
}
