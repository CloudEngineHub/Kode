import { Box, Text } from 'ink'
import React, { useSyncExternalStore } from 'react'
import { Cost } from '#ui-ink/components/Cost'
import { MaxSizedText } from '#ui-ink/components/MaxSizedText'
import { useTerminalSize } from '#ui-ink/hooks/useTerminalSize'
import { CIRCLE } from '#core/constants/figures'
import { getTheme } from '#core/utils/theme'
import type { TranscriptItem } from './useTranscriptItems'
import type { AssistantStreamStore } from './assistantStreamStore'

export function AssistantStreamPreview({
  store,
  transientItems,
  maxHeight,
  isVisible,
  debug,
}: {
  store: AssistantStreamStore
  transientItems: TranscriptItem[]
  maxHeight: number
  isVisible: boolean
  debug: boolean
}) {
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  )
  const hasLiveText = snapshot.text.trim().length > 0

  if (
    !isVisible ||
    maxHeight <= 0 ||
    (transientItems.length === 0 && !hasLiveText)
  ) {
    return null
  }

  return (
    <Box
      flexDirection="column"
      height={maxHeight}
      justifyContent="flex-end"
      overflow="hidden"
      width="100%"
    >
      {transientItems.map(item => item.jsx)}
      {hasLiveText && (
        <AssistantStreamText
          text={snapshot.text}
          debug={debug}
          addMargin={transientItems.length > 0}
          maxHeight={maxHeight}
        />
      )}
    </Box>
  )
}

/**
 * A stream is updated in-place many times before it becomes a completed
 * transcript message. Parsing the whole accumulated value as Markdown for
 * every frame causes incomplete syntax (especially code fences and emphasis)
 * to restyle earlier rows, which makes terminals visibly redraw/flicker.
 *
 * Keep the preview deliberately plain and bounded. The completed message is
 * still rendered by AssistantTextMessage, so finalized transcript output
 * keeps the normal Markdown rendering.
 */
const AssistantStreamText = React.memo(function AssistantStreamText({
  text,
  debug,
  addMargin,
  maxHeight,
}: {
  text: string
  debug: boolean
  addMargin: boolean
  maxHeight: number
}): React.ReactNode {
  const { columns } = useTerminalSize()
  const contentWidth = Math.max(1, columns - 6)

  return (
    <Box
      alignItems="flex-start"
      flexDirection="row"
      justifyContent="space-between"
      marginTop={addMargin ? 1 : 0}
      width="100%"
    >
      <Box flexDirection="row">
        <Box minWidth={2}>
          <Text color={getTheme().kode}>{CIRCLE}</Text>
        </Box>
        <Box flexDirection="column" width={contentWidth}>
          <MaxSizedText
            text={text}
            maxHeight={maxHeight}
            maxWidth={contentWidth}
            overflowDirection="bottom"
          />
        </Box>
      </Box>
      <Cost costUSD={0} durationMs={0} debug={debug} />
    </Box>
  )
})
