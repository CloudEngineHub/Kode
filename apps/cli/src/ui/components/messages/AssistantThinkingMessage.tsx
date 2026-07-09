import React, { useMemo, useState } from 'react'
import { Box, Text, useIsScreenReaderEnabled } from 'ink'
import { getTheme } from '#core/utils/theme'
import { applyMarkdown } from '#core/utils/markdown'
import { useInterval } from '#ui-ink/hooks/useInterval'
import {
  ThinkingBlock,
  ThinkingBlockParam,
} from '@anthropic-ai/sdk/resources/index.mjs'
import { BULLET } from '#core/constants/figures'

const PROGRESS_FRAMES = ['/', '-', '\\', '|']

type Props = {
  param: ThinkingBlock | ThinkingBlockParam
  addMargin: boolean
  shouldAnimate?: boolean
}

export function AssistantThinkingMessage({
  param: { thinking },
  addMargin = false,
  shouldAnimate = true,
}: Props): React.ReactNode {
  const [progressFrame, setProgressFrame] = useState(0)
  const isScreenReaderEnabled = useIsScreenReaderEnabled()
  const theme = getTheme()
  const hasThinking = Boolean(thinking && thinking.trim().length > 0)
  const formattedThinking = useMemo(
    () => (hasThinking ? applyMarkdown(thinking) : ''),
    [hasThinking, thinking],
  )

  useInterval(
    () => setProgressFrame(f => (f + 1) % PROGRESS_FRAMES.length),
    shouldAnimate && !isScreenReaderEnabled && hasThinking ? 150 : null,
  )

  if (!hasThinking) {
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
          {formattedThinking}
        </Text>
      </Box>
    </Box>
  )
}
