import type { MessageParam } from '@anthropic-ai/sdk/resources/index.mjs'
import type { AssistantMessage, UserMessage } from '#core/query'

export function userMessageToMessageParam(
  message: UserMessage,
  addCache = false,
): MessageParam {
  if (addCache) {
    if (typeof message.message.content === 'string') {
      return {
        role: 'user',
        content: [
          {
            type: 'text',
            text: message.message.content,
          },
        ],
      }
    } else {
      return {
        role: 'user',
        content: message.message.content.map(_ => ({ ..._ })),
      }
    }
  }
  return {
    role: 'user',
    content: message.message.content,
  }
}

export function assistantMessageToMessageParam(
  message: AssistantMessage,
  addCache = false,
): MessageParam {
  if (addCache) {
    if (typeof message.message.content === 'string') {
      return {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: message.message.content,
          },
        ],
      }
    } else {
      return {
        role: 'assistant',
        content: message.message.content.map(_ => ({ ..._ })),
      }
    }
  }
  return {
    role: 'assistant',
    content: message.message.content,
  }
}

export function addCacheBreakpoints(
  messages: (UserMessage | AssistantMessage)[],
): MessageParam[] {
  return messages.map((msg, index) => {
    return msg.type === 'user'
      ? userMessageToMessageParam(msg, index > messages.length - 3)
      : assistantMessageToMessageParam(msg, index > messages.length - 3)
  })
}
