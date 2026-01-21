import { Box, Text } from 'ink'
import * as React from 'react'
import { useEffect, useMemo, useState } from 'react'
import figures from 'figures'
import { getTheme } from '#core/utils/theme'
import { randomUUID } from 'crypto'
import type { Tool } from '#core/tooling/Tool'
import { createUserMessage, stripSystemMessages } from '#core/utils/messages'
import type { Message as MessageType, UserMessage } from '#core/query'
import { useExitOnCtrlCD } from '#ui-ink/hooks/useExitOnCtrlCD'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { useTerminalSize } from '#ui-ink/hooks/useTerminalSize'

type Props = {
  erroredToolUseIDs: Set<string>
  messages: MessageType[]
  onSelect: (message: MessageType) => void | Promise<void>
  onEscape: () => void
  tools: Tool[]
  unresolvedToolUseIDs: Set<string>
}

const MAX_VISIBLE_MESSAGES = 7
const SELECTOR_OVERHEAD_ROWS = 7
const SELECTOR_RESERVED_ROWS = 4
const INDEX_WIDTH = 7

function extractUserMessageText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  const parts: string[] = []
  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    const record = block as { type?: unknown; text?: unknown }
    if (record.type !== 'text') continue
    parts.push(String(record.text ?? ''))
  }

  return parts.join('\n')
}

function isToolResultOnlyMessage(message: UserMessage): boolean {
  if (!Array.isArray(message.message.content)) return false

  let hasToolResult = false
  let hasText = false
  for (const block of message.message.content) {
    if (!block || typeof block !== 'object') continue
    const record = block as { type?: unknown; text?: unknown }
    if (record.type === 'tool_result') {
      hasToolResult = true
      continue
    }
    if (record.type === 'text') {
      const text = String(record.text ?? '')
      if (text.trim()) hasText = true
    }
  }

  return hasToolResult && !hasText
}

export function MessageSelector({
  messages,
  onSelect,
  onEscape,
}: Props): React.ReactNode {
  const currentUUID = useMemo(() => randomUUID(), [])
  const { rows } = useTerminalSize()

  function handleSelect(message: MessageType) {
    onSelect(message)
  }

  function handleEscape() {
    onEscape()
  }

  // Add current prompt as a virtual message
  const allItems = useMemo(() => {
    const filtered = messages.filter(
      (message): message is UserMessage =>
        message.type === 'user' && !isToolResultOnlyMessage(message),
    )
    return [
      ...filtered,
      { ...createUserMessage(''), uuid: currentUUID } as UserMessage,
    ]
  }, [messages, currentUUID])
  const [selectedIndex, setSelectedIndex] = useState(allItems.length - 1)

  useEffect(() => {
    setSelectedIndex(previous => {
      if (allItems.length === 0) return 0
      return Math.min(previous, allItems.length - 1)
    })
  }, [allItems.length])

  const exitState = useExitOnCtrlCD(() => process.exit(0))

  useKeypress((input, key) => {
    if (key.tab || key.escape) {
      handleEscape()
      return
    }
    if (key.return) {
      handleSelect(allItems[selectedIndex]!)
      return
    }
    if (key.upArrow) {
      if (key.ctrl || key.shift || key.meta) {
        // Jump to top with any modifier key
        setSelectedIndex(0)
      } else {
        setSelectedIndex(prev => Math.max(0, prev - 1))
      }
    }
    if (key.downArrow) {
      if (key.ctrl || key.shift || key.meta) {
        // Jump to bottom with any modifier key
        setSelectedIndex(allItems.length - 1)
      } else {
        setSelectedIndex(prev => Math.min(allItems.length - 1, prev + 1))
      }
    }

    // Handle number keys (1-9)
    const num = Number(input)
    if (!isNaN(num) && num >= 1 && num <= Math.min(9, allItems.length)) {
      if (!allItems[num - 1]) {
        return
      }
      handleSelect(allItems[num - 1]!)
    }
  })

  const maxVisibleCount = Math.max(
    1,
    rows - SELECTOR_OVERHEAD_ROWS - SELECTOR_RESERVED_ROWS,
  )
  const targetVisibleCount = Math.min(MAX_VISIBLE_MESSAGES, maxVisibleCount)
  const visibleCount = Math.min(allItems.length, targetVisibleCount)

  const firstVisibleIndex = Math.max(
    0,
    Math.min(
      selectedIndex - Math.floor(visibleCount / 2),
      allItems.length - visibleCount,
    ),
  )
  const visibleItems = allItems.slice(
    firstVisibleIndex,
    firstVisibleIndex + visibleCount,
  )
  const missingRows = Math.max(0, targetVisibleCount - visibleItems.length)

  return (
    <>
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={getTheme().secondaryBorder}
        paddingX={1}
        marginTop={1}
      >
        <Box flexDirection="column" minHeight={2} marginBottom={1}>
          <Text bold>Jump to a previous message</Text>
          <Text dimColor>This will fork the conversation</Text>
        </Box>
        {visibleItems.map((msg, index) => {
          const actualIndex = firstVisibleIndex + index
          const isSelected = actualIndex === selectedIndex
          const isCurrent = msg.uuid === currentUUID

          const cleanedText = stripSystemMessages(
            extractUserMessageText(msg.message.content),
          )
          const firstLine =
            cleanedText
              .split('\n')
              .map(line => line.trim())
              .find(Boolean) ?? ''
          const isEmpty = !firstLine

          return (
            <Box key={msg.uuid} flexDirection="row" height={1} minHeight={1}>
              <Box width={INDEX_WIDTH}>
                {isSelected ? (
                  <Text color="blue" bold>
                    {figures.pointer} {actualIndex + 1}{' '}
                  </Text>
                ) : (
                  <Text>
                    {'  '}
                    {actualIndex + 1}{' '}
                  </Text>
                )}
              </Box>
              <Box height={1} overflow="hidden" width="100%">
                {isCurrent ? (
                  <Box width="100%">
                    <Text dimColor italic>
                      {'(current)'}
                    </Text>
                  </Box>
                ) : (
                  <Text dimColor={isEmpty} italic={isEmpty} wrap="truncate-end">
                    {isEmpty ? '(empty message)' : firstLine}
                  </Text>
                )}
              </Box>
            </Box>
          )
        })}
        {missingRows > 0
          ? Array.from({ length: missingRows }).map((_, idx) => (
              <Box key={`empty-${idx}`} flexDirection="row" height={1}>
                <Box width={INDEX_WIDTH}>
                  <Text> </Text>
                </Box>
                <Text> </Text>
              </Box>
            ))
          : null}
      </Box>
      <Box marginLeft={3}>
        <Text dimColor>
          {exitState.pending ? (
            <>Press {exitState.keyName} again to exit</>
          ) : (
            <>↑/↓ to select · Enter to confirm · Tab/Esc to cancel</>
          )}
        </Text>
      </Box>
    </>
  )
}
