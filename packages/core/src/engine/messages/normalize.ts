import { createHash, randomUUID } from 'crypto'
import type { UUID } from 'crypto'

import type {
  ImageBlockParam,
  TextBlockParam,
  ToolResultBlockParam,
  ToolUseBlockParam,
} from '@anthropic-ai/sdk/resources/index.mjs'

import { NO_CONTENT_MESSAGE } from '#core/ai/constants'
import type { AssistantMessage, Message, ProgressMessage } from '#core/query'

import { INTERRUPT_MESSAGE_FOR_TOOL_USE } from './constants'

function stableUuidFromSeed(seed: string): UUID {
  const hex = createHash('sha256').update(seed).digest('hex').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}` as UUID
}

export function isNotEmptyMessage(message: Message): boolean {
  if (message.type === 'progress') {
    return true
  }

  if (typeof message.message.content === 'string') {
    return message.message.content.trim().length > 0
  }

  if (message.message.content.length === 0) {
    return false
  }

  if (message.message.content.length > 1) {
    return true
  }

  if (message.message.content[0]!.type !== 'text') {
    return true
  }

  return (
    message.message.content[0]!.text.trim().length > 0 &&
    message.message.content[0]!.text !== NO_CONTENT_MESSAGE &&
    message.message.content[0]!.text !== INTERRUPT_MESSAGE_FOR_TOOL_USE
  )
}

type NormalizedUserMessage = {
  message: {
    content: [
      | TextBlockParam
      | ImageBlockParam
      | ToolUseBlockParam
      | ToolResultBlockParam,
    ]
    role: 'user'
  }
  type: 'user'
  uuid: UUID
}

export type NormalizedMessage =
  | NormalizedUserMessage
  | AssistantMessage
  | ProgressMessage

export function normalizeMessages(messages: Message[]): NormalizedMessage[] {
  return messages.flatMap(message => {
    if (message.type === 'progress') {
      return [message] as NormalizedMessage[]
    }
    if (typeof message.message.content === 'string') {
      return [message] as NormalizedMessage[]
    }

    // User messages should not be split by content blocks - return as single message
    if (message.type === 'user') {
      return [message] as NormalizedMessage[]
    }

    // Only assistant messages need to be split by content blocks
    // Sort blocks so thinking/text appear before tool_use (for better UX)
    const contentBlocks = message.message.content
      .filter(
        block =>
          !(
            block.type === 'thinking' &&
            !(
              typeof (block as { thinking?: unknown }).thinking === 'string' &&
              (block as { thinking: string }).thinking.trim().length > 0
            )
          ),
      )
      .sort((a, b) => {
        const order: Record<string, number> = {
          thinking: 0,
          redacted_thinking: 1,
          text: 2,
          tool_use: 3,
          server_tool_use: 3,
          mcp_tool_use: 3,
        }
        return (order[a.type] ?? 2) - (order[b.type] ?? 2)
      })

    return contentBlocks.map((block, blockIndex) => {
      const msgRecord = message as {
        uuid?: unknown
        message?: { id?: unknown }
      }
      const baseSeed =
        typeof msgRecord.uuid === 'string'
          ? msgRecord.uuid
          : String(msgRecord.message?.id ?? randomUUID())
      return {
        type: 'assistant',
        uuid: stableUuidFromSeed(`${baseSeed}:${blockIndex}`),
        message: {
          ...message.message,
          content: [block],
        },
        costUSD: (message as AssistantMessage).costUSD / contentBlocks.length,
        durationMs: (message as AssistantMessage).durationMs,
      } as NormalizedMessage
    })
  })
}
