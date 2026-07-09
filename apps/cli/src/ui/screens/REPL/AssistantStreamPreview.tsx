import { Box } from 'ink'
import React, { useSyncExternalStore } from 'react'
import { AssistantTextMessage } from '#ui-ink/components/messages/AssistantTextMessage'
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
        <AssistantTextMessage
          param={{ type: 'text', text: snapshot.text }}
          costUSD={0}
          durationMs={0}
          debug={debug}
          addMargin={transientItems.length > 0}
          shouldShowDot
          isTransient
        />
      )}
    </Box>
  )
}
