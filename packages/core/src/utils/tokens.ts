import { Message } from '#core/query'
import { SYNTHETIC_ASSISTANT_MESSAGES } from './messages'

export function countTokens(messages: Message[]): number {
  let i = messages.length - 1
  while (i >= 0) {
    const message = messages[i]
    if (
      message?.type === 'assistant' &&
      'usage' in message.message &&
      !(
        message.message.content[0]?.type === 'text' &&
        SYNTHETIC_ASSISTANT_MESSAGES.has(message.message.content[0].text)
      )
    ) {
      const { usage } = message.message
      const total =
        usage.input_tokens +
        (usage.cache_creation_input_tokens ?? 0) +
        (usage.cache_read_input_tokens ?? 0) +
        usage.output_tokens
      if (total > 0) {
        return total
      }
    }
    i--
  }
  return 0
}

export function countCachedTokens(messages: Message[]): number {
  let i = messages.length - 1
  while (i >= 0) {
    const message = messages[i]
    if (message?.type === 'assistant' && 'usage' in message.message) {
      const { usage } = message.message
      return (
        (usage.cache_creation_input_tokens ?? 0) +
        (usage.cache_read_input_tokens ?? 0)
      )
    }
    i--
  }
  return 0
}

const CHARS_PER_TOKEN_ESTIMATE = 4
const IMAGE_TOKENS_ESTIMATE = 2_000
const TOKEN_OVERHEAD_MULTIPLIER = 4 / 3

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function estimateTokensFromText(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE)
}

function estimateTokensFromToolResultContent(content: unknown): number {
  if (!content) return 0
  if (typeof content === 'string') return estimateTokensFromText(content)

  if (Array.isArray(content)) {
    return content.reduce((sum, item) => {
      if (!item || typeof item !== 'object') {
        return sum + estimateTokensFromText(String(item ?? ''))
      }

      const record = item as Record<string, unknown>
      const type = typeof record.type === 'string' ? record.type : 'unknown'
      if (type === 'text') {
        return sum + estimateTokensFromText(String(record.text ?? ''))
      }
      if (type === 'image') {
        return sum + IMAGE_TOKENS_ESTIMATE
      }

      return sum + estimateTokensFromText(safeStringify(record))
    }, 0)
  }

  return estimateTokensFromText(safeStringify(content))
}

function estimateTokensFromMessageContent(content: unknown): number {
  if (!content) return 0
  if (typeof content === 'string') return estimateTokensFromText(content)

  if (!Array.isArray(content)) {
    return estimateTokensFromText(safeStringify(content))
  }

  return content.reduce((sum, block) => {
    if (!block || typeof block !== 'object') {
      return sum + estimateTokensFromText(String(block ?? ''))
    }

    const record = block as Record<string, unknown>
    const type = typeof record.type === 'string' ? record.type : 'unknown'

    if (type === 'text') {
      return sum + estimateTokensFromText(String(record.text ?? ''))
    }
    if (type === 'image') {
      return sum + IMAGE_TOKENS_ESTIMATE
    }
    if (type === 'tool_result') {
      return sum + estimateTokensFromToolResultContent(record.content)
    }

    return sum + estimateTokensFromText(safeStringify(record))
  }, 0)
}

/**
 * Best-effort token estimate for the current transcript.
 *
 * Unlike `countTokens()`, this does not rely on SDK usage metadata (which may be
 * missing or stale after transcript transforms like microcompaction).
 */
export function estimateTokens(messages: Message[]): number {
  const base = messages.reduce((sum, message) => {
    if (!message) return sum
    if (message.type === 'progress') return sum
    if (message.type === 'assistant' && message.isMeta === true) return sum
    return sum + estimateTokensFromMessageContent(message.message.content)
  }, 0)

  return Math.ceil(base * TOKEN_OVERHEAD_MULTIPLIER)
}
