import OpenAI from 'openai'
import {
  extractTextAndImageUrls,
  getImageUrlFromPart,
  toOpenAIImageUrlParts,
} from '#core/utils/visionContent'

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

type AnthropicImageBlock = {
  type: 'image'
  source:
    | { type: 'base64'; media_type: string; data: string }
    | { type: 'url'; url: string }
}

type AnthropicTextBlock = { type: 'text'; text: string }
type AnthropicToolUseBlock = {
  type: 'tool_use'
  id: string
  name: string
  input: unknown
}
type AnthropicToolResultBlock = {
  type: 'tool_result'
  tool_use_id: string
  content: unknown
}

type AnthropicBlock =
  | AnthropicTextBlock
  | AnthropicImageBlock
  | AnthropicToolUseBlock
  | AnthropicToolResultBlock
  | { type: string }

type AnthropicLikeMessage = {
  message: {
    role: 'user' | 'assistant'
    content: string | AnthropicBlock[] | AnthropicBlock
  }
}

export function convertAnthropicMessagesToOpenAIMessages(
  messages: AnthropicLikeMessage[],
): (
  | OpenAI.ChatCompletionMessageParam
  | OpenAI.ChatCompletionToolMessageParam
)[] {
  const openaiMessages: OpenAI.ChatCompletionMessageParam[] = []

  const toolResults: Record<
    string,
    {
      toolMessage: OpenAI.ChatCompletionToolMessageParam
      imageMessage?: OpenAI.ChatCompletionUserMessageParam
    }
  > = {}

  for (const message of messages) {
    const blocks: AnthropicBlock[] = []
    if (typeof message.message.content === 'string') {
      blocks.push({ type: 'text', text: message.message.content })
    } else if (Array.isArray(message.message.content)) {
      blocks.push(...message.message.content)
    } else if (message.message.content) {
      blocks.push(message.message.content)
    }

    const role = message.message.role

    const userContentParts: OpenAI.ChatCompletionContentPart[] = []
    const assistantTextParts: string[] = []
    const assistantToolCalls: OpenAI.ChatCompletionMessageToolCall[] = []

    for (const block of blocks) {
      if (block.type === 'text') {
        const record = asRecord(block)
        const text =
          record && typeof record.text === 'string' ? record.text : ''
        if (!text) continue
        if (role === 'user') {
          userContentParts.push({ type: 'text', text })
        } else if (role === 'assistant') {
          assistantTextParts.push(text)
        }
        continue
      }

      if (block.type === 'image' && role === 'user') {
        const imageUrl = getImageUrlFromPart(block as any)
        if (imageUrl) {
          userContentParts.push({
            type: 'image_url',
            image_url: { url: imageUrl },
          })
        }
        continue
      }

      if (block.type === 'tool_use') {
        assistantToolCalls.push({
          type: 'function',
          function: {
            name: (block as AnthropicToolUseBlock).name,
            arguments: JSON.stringify((block as AnthropicToolUseBlock).input),
          },
          id: (block as AnthropicToolUseBlock).id,
        })
        continue
      }

      if (block.type === 'tool_result') {
        const toolUseId = (block as AnthropicToolResultBlock).tool_use_id
        const rawToolContent = (block as AnthropicToolResultBlock).content
        const { text, imageUrls } = extractTextAndImageUrls(rawToolContent)
        const toolContent =
          text || (imageUrls.length > 0 ? '(image output attached)' : '')
        const result: {
          toolMessage: OpenAI.ChatCompletionToolMessageParam
          imageMessage?: OpenAI.ChatCompletionUserMessageParam
        } = {
          toolMessage: {
            role: 'tool',
            content: toolContent,
            tool_call_id: toolUseId,
          },
        }

        if (imageUrls.length > 0) {
          result.imageMessage = {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Image output from tool ${toolUseId}:`,
              },
              ...toOpenAIImageUrlParts(imageUrls),
            ],
          } as any
        }
        toolResults[toolUseId] = result
        continue
      }
    }

    if (role === 'user') {
      if (
        userContentParts.length === 1 &&
        userContentParts[0]?.type === 'text'
      ) {
        openaiMessages.push(<OpenAI.ChatCompletionUserMessageParam>{
          role: 'user',
          content: userContentParts[0].text,
        })
      } else if (userContentParts.length > 0) {
        openaiMessages.push(<OpenAI.ChatCompletionUserMessageParam>{
          role: 'user',
          content: userContentParts,
        })
      }
      continue
    }

    if (role === 'assistant') {
      const text = assistantTextParts.filter(Boolean).join('\n')
      if (assistantToolCalls.length > 0) {
        openaiMessages.push(<OpenAI.ChatCompletionAssistantMessageParam>{
          role: 'assistant',
          content: text ? text : undefined,
          tool_calls: assistantToolCalls,
        })
        continue
      }
      if (text) {
        openaiMessages.push(<OpenAI.ChatCompletionAssistantMessageParam>{
          role: 'assistant',
          content: text,
        })
      }
    }
  }

  const finalMessages: OpenAI.ChatCompletionMessageParam[] = []

  for (const message of openaiMessages) {
    finalMessages.push(message)

    if (message.role === 'assistant' && Array.isArray(message.tool_calls)) {
      for (const toolCall of message.tool_calls) {
        const result = toolResults[toolCall.id]
        if (result) {
          finalMessages.push(result.toolMessage)
          if (result.imageMessage) {
            finalMessages.push(result.imageMessage)
          }
        }
      }
    }
  }

  return finalMessages
}
