import type { TextBlock } from '@anthropic-ai/sdk/resources/index.mjs'
import type { UUID } from '#core/types/common'
import type { NormalizedMessage } from '#core/utils/messages'
import { findSafeSplitPoint } from '#cli-utils/markdownSplit'

const MAX_TRANSIENT_TAIL_LENGTH = 2000
const MIN_TRANSIENT_CHUNK_LENGTH = 400

export type TranscriptChunkState = {
  chunks: string[]
  prefixText: string
}

export type TranscriptRenderMessage = {
  message: NormalizedMessage
  key: string
  isTransient: boolean
}

export type TranscriptRenderModel = {
  renderMessages: TranscriptRenderMessage[]
  replStaticPrefixLength: number
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
  chunkState: Map<string, TranscriptChunkState>,
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

export function buildTranscriptRenderModel(args: {
  orderedMessages: NormalizedMessage[]
  replStaticPrefixLength: number
  chunkState: Map<string, TranscriptChunkState>
}): TranscriptRenderModel {
  const { orderedMessages, replStaticPrefixLength, chunkState } = args
  const activeIds = new Set<string>(
    orderedMessages.map(message => message.uuid),
  )
  for (const key of chunkState.keys()) {
    if (!activeIds.has(key)) {
      chunkState.delete(key)
    }
  }

  const renderMessages: TranscriptRenderMessage[] = []
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
}
