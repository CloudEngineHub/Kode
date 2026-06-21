import { Box } from 'ink'
import type {
  TextBlock,
  ToolUseBlockParam,
} from '@anthropic-ai/sdk/resources/index.mjs'
import * as React from 'react'
import { useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { Message } from '#ui-ink/components/Message'
import { MessageResponse } from '#ui-ink/components/MessageResponse'
import type { Message as MessageType } from '#core/query'
import type { Tool } from '#core/tooling/Tool'
import {
  getErroredToolUseMessages,
  getInProgressToolUseIDs,
  getToolUseID,
  getUnresolvedToolUseIDs,
  INTERRUPT_MESSAGE,
  isNotEmptyMessage,
  normalizeMessages,
  reorderMessages,
  type NormalizedMessage,
} from '#core/utils/messages'
import type { UUID } from '#core/types/common'
import { getReplStaticPrefixLength } from '#cli-utils/replStaticSplit'
import { findSafeSplitPoint } from '#cli-utils/markdownSplit'

const MAX_TRANSIENT_TAIL_LENGTH = 2000
const MIN_TRANSIENT_CHUNK_LENGTH = 400

type ChunkState = {
  chunks: string[]
  prefixText: string
}

type RenderMessage = {
  message: NormalizedMessage
  key: string
  isTransient: boolean
}

function cloneAssistantTextMessage(
  message: NormalizedMessage,
  text: string,
  uuid: UUID,
  includeCost: boolean,
): NormalizedMessage {
  const assistant = message as Extract<NormalizedMessage, { type: 'assistant' }>
  const baseContent = Array.isArray(assistant.message.content)
    ? assistant.message.content[0]
    : {
        type: 'text',
        text: String(assistant.message.content ?? ''),
        citations: [],
      }
  const textBlock: TextBlock = {
    ...(baseContent as TextBlock),
    citations: (baseContent as TextBlock).citations ?? [],
    text,
  }

  return {
    ...assistant,
    uuid,
    costUSD: includeCost ? assistant.costUSD : 0,
    durationMs: includeCost ? assistant.durationMs : 0,
    message: {
      ...assistant.message,
      content: [textBlock],
    },
  }
}

function isAssistantTextMessage(message: NormalizedMessage): boolean {
  if (message.type !== 'assistant') return false
  if (!Array.isArray(message.message.content)) return false
  return message.message.content[0]?.type === 'text'
}

function splitTransientTextMessage(
  message: NormalizedMessage,
  chunkState: Map<string, ChunkState>,
): { chunks: string[]; tail: string } | null {
  if (!isAssistantTextMessage(message)) return null

  const assistant = message as Extract<NormalizedMessage, { type: 'assistant' }>
  const text = (assistant.message.content[0] as TextBlock).text ?? ''
  const existing = chunkState.get(message.uuid)
  const prefixText = existing?.prefixText ?? ''

  if (prefixText && !text.startsWith(prefixText)) {
    chunkState.delete(message.uuid)
  }

  const state = chunkState.get(message.uuid) ?? { chunks: [], prefixText: '' }
  let tail = text.slice(state.prefixText.length)
  let didUpdate = false

  while (tail.length > MAX_TRANSIENT_TAIL_LENGTH + MIN_TRANSIENT_CHUNK_LENGTH) {
    const splitAt = findSafeSplitPoint(
      tail,
      tail.length - MAX_TRANSIENT_TAIL_LENGTH,
    )
    if (splitAt <= 0) break
    const chunk = tail.slice(0, splitAt)
    if (chunk.length < MIN_TRANSIENT_CHUNK_LENGTH) break
    state.chunks.push(chunk)
    state.prefixText += chunk
    tail = tail.slice(splitAt)
    didUpdate = true
  }

  if (state.chunks.length === 0) {
    chunkState.delete(message.uuid)
    return null
  }

  if (didUpdate || !existing) {
    chunkState.set(message.uuid, state)
  }

  return { chunks: state.chunks, tail }
}

export type TranscriptItem = { jsx: ReactNode; key: string }

export function useTranscriptItems(args: {
  messages: MessageType[]
  tools: Tool[]
  verbose: boolean
  debug: boolean
  toolJSX: {
    jsx: ReactNode | null
    shouldHidePromptInput: boolean
    displayMode?: 'inline' | 'fullscreen'
  } | null
  toolUseConfirm: unknown | null
  isMessageSelectorVisible: boolean
  forkNumber: number
}): {
  normalizedMessages: NormalizedMessage[]
  orderedMessages: NormalizedMessage[]
  unresolvedToolUseIDs: Set<string>
  inProgressToolUseIDs: Set<string>
  erroredToolUseIDs: Set<string>
  replStaticPrefixLength: number
  items: TranscriptItem[]
} {
  const chunkStateRef = useRef<Map<string, ChunkState>>(new Map())
  const normalizedMessages = useMemo(
    () => normalizeMessages(args.messages).filter(isNotEmptyMessage),
    [args.messages],
  )

  const unresolvedToolUseIDs = useMemo(
    () => getUnresolvedToolUseIDs(normalizedMessages),
    [normalizedMessages],
  )

  const inProgressToolUseIDs = useMemo(
    () => getInProgressToolUseIDs(normalizedMessages),
    [normalizedMessages],
  )

  const erroredToolUseIDs = useMemo(
    () =>
      new Set(
        getErroredToolUseMessages(normalizedMessages).map(
          _ => (_.message.content[0]! as ToolUseBlockParam).id,
        ),
      ),
    [normalizedMessages],
  )

  const orderedMessages = useMemo(
    () => reorderMessages(normalizedMessages),
    [normalizedMessages],
  )

  const replStaticPrefixLength = useMemo(
    () =>
      getReplStaticPrefixLength(
        orderedMessages,
        normalizedMessages,
        unresolvedToolUseIDs,
      ),
    [orderedMessages, normalizedMessages, unresolvedToolUseIDs],
  )

  const chunked = useMemo(() => {
    const chunkState = chunkStateRef.current
    const activeIds = new Set<string>(
      orderedMessages.map(message => message.uuid),
    )
    for (const key of chunkState.keys()) {
      if (!activeIds.has(key)) {
        chunkState.delete(key)
      }
    }

    const renderMessages: RenderMessage[] = []
    let staticPrefixExtra = 0

    orderedMessages.forEach((message, index) => {
      if (index < replStaticPrefixLength) {
        chunkState.delete(message.uuid)
        renderMessages.push({
          message,
          key: message.uuid,
          isTransient: false,
        })
        return
      }

      if (index === replStaticPrefixLength) {
        const split = splitTransientTextMessage(message, chunkState)
        if (split) {
          const { chunks, tail } = split
          const tailHasContent = tail.length > 0

          chunks.forEach((chunk, chunkIndex) => {
            const isLastChunk = chunkIndex === chunks.length - 1
            const includeCost = !tailHasContent && isLastChunk
            const chunkMessage = cloneAssistantTextMessage(
              message,
              chunk,
              `${message.uuid}:chunk:${chunkIndex}`,
              includeCost,
            )
            renderMessages.push({
              message: chunkMessage,
              key: chunkMessage.uuid,
              isTransient: false,
            })
          })

          staticPrefixExtra += chunks.length

          if (tailHasContent) {
            const tailMessage = cloneAssistantTextMessage(
              message,
              tail,
              `${message.uuid}:tail`,
              true,
            )
            renderMessages.push({
              message: tailMessage,
              key: tailMessage.uuid,
              isTransient: true,
            })
          }
          return
        }
      }

      renderMessages.push({
        message,
        key: message.uuid,
        isTransient: true,
      })
    })

    return {
      renderMessages,
      replStaticPrefixLength: replStaticPrefixLength + staticPrefixExtra,
    }
  }, [orderedMessages, replStaticPrefixLength])

  const items = useMemo(() => {
    return chunked.renderMessages.map(
      ({ message, key, isTransient }, index) => {
        const toolUseID = getToolUseID(message)
        const isInStaticPrefix = index < chunked.replStaticPrefixLength

        const rendered =
          message.type === 'progress' ? (
            message.content.message.content[0]?.type === 'text' &&
            message.content.message.content[0].text === INTERRUPT_MESSAGE ? (
              <Message
                message={message.content}
                messages={message.normalizedMessages}
                addMargin={false}
                tools={message.tools}
                verbose={args.verbose}
                debug={args.debug}
                erroredToolUseIDs={new Set()}
                inProgressToolUseIDs={new Set()}
                unresolvedToolUseIDs={new Set()}
                shouldAnimate={false}
                shouldShowDot={false}
                isTransient={isTransient}
              />
            ) : (
              <MessageResponse
                children={
                  <Message
                    message={message.content}
                    messages={message.normalizedMessages}
                    addMargin={false}
                    tools={message.tools}
                    verbose={args.verbose}
                    debug={args.debug}
                    erroredToolUseIDs={new Set()}
                    inProgressToolUseIDs={new Set()}
                    unresolvedToolUseIDs={
                      new Set([
                        (
                          message.content.message
                            .content[0]! as ToolUseBlockParam
                        ).id,
                      ])
                    }
                    shouldAnimate={false}
                    shouldShowDot={false}
                    isTransient={isTransient}
                  />
                }
              />
            )
          ) : (
            <Message
              message={message}
              messages={normalizedMessages}
              addMargin={true}
              tools={args.tools}
              verbose={args.verbose}
              debug={args.debug}
              erroredToolUseIDs={erroredToolUseIDs}
              inProgressToolUseIDs={inProgressToolUseIDs}
              shouldAnimate={
                !args.toolJSX &&
                !args.toolUseConfirm &&
                !args.isMessageSelectorVisible &&
                (!toolUseID || inProgressToolUseIDs.has(toolUseID))
              }
              shouldShowDot={true}
              unresolvedToolUseIDs={unresolvedToolUseIDs}
              isTransient={isTransient}
            />
          )

        if (args.debug) {
          return {
            key,
            jsx: (
              <Box
                borderStyle="single"
                borderColor={isInStaticPrefix ? 'green' : 'red'}
                key={key}
                width="100%"
              >
                {rendered}
              </Box>
            ),
          }
        }

        return {
          key,
          jsx: (
            <Box key={key} width="100%">
              {rendered}
            </Box>
          ),
        }
      },
    )
  }, [
    args.debug,
    args.isMessageSelectorVisible,
    args.toolJSX,
    args.toolUseConfirm,
    args.tools,
    args.verbose,
    chunked.renderMessages,
    chunked.replStaticPrefixLength,
    erroredToolUseIDs,
    inProgressToolUseIDs,
    normalizedMessages,
    unresolvedToolUseIDs,
  ])

  return {
    normalizedMessages,
    orderedMessages,
    unresolvedToolUseIDs,
    inProgressToolUseIDs,
    erroredToolUseIDs,
    replStaticPrefixLength: chunked.replStaticPrefixLength,
    items,
  }
}
