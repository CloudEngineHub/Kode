import OpenAI from 'openai'
import { nanoid } from 'nanoid'
import type {
  ContentBlock,
  Message as AnthropicMessage,
} from '@anthropic-ai/sdk/resources/index.mjs'
import type { Tool } from '#core/tooling/Tool'
import type { AssistantMessage, UserMessage } from '#core/query'
import { convertAnthropicMessagesToOpenAIMessages as convertAnthropicMessagesToOpenAIMessagesUtil } from '#core/utils/openaiMessageConversion'
import { normalizeUsage } from './usage'

function mapFinishReasonToStopReason(
  reason: OpenAI.ChatCompletion.Choice['finish_reason'] | null | undefined,
): AnthropicMessage['stop_reason'] {
  switch (reason) {
    case 'stop':
      return 'end_turn'
    case 'length':
      return 'max_tokens'
    case 'tool_calls':
    case 'function_call':
      return 'tool_use'
    default:
      return null
  }
}

export function convertAnthropicMessagesToOpenAIMessages(
  messages: (UserMessage | AssistantMessage)[],
): (
  | OpenAI.ChatCompletionMessageParam
  | OpenAI.ChatCompletionToolMessageParam
)[] {
  return convertAnthropicMessagesToOpenAIMessagesUtil(messages)
}

export function convertOpenAIResponseToAnthropic(
  response: OpenAI.ChatCompletion,
  tools?: Tool[],
): AnthropicMessage {
  const normalizedUsage = normalizeUsage(response.usage)
  let contentBlocks: ContentBlock[] = []
  const message = response.choices?.[0]?.message
  if (!message) {
    return {
      id: nanoid(),
      model: response.model ?? '<openai>',
      role: 'assistant',
      content: [],
      stop_reason: mapFinishReasonToStopReason(
        response.choices?.[0]?.finish_reason,
      ),
      stop_sequence: null,
      type: 'message',
      usage: {
        input_tokens: normalizedUsage.input_tokens ?? 0,
        output_tokens: normalizedUsage.output_tokens ?? 0,
        cache_creation_input_tokens:
          normalizedUsage.cache_creation_input_tokens ?? 0,
        cache_read_input_tokens: normalizedUsage.cache_read_input_tokens ?? 0,
      },
    }
  }

  if (message?.tool_calls) {
    for (const toolCall of message.tool_calls) {
      const tool = toolCall.function
      const toolName = tool.name
      let toolArgs = {}
      try {
        toolArgs = tool.arguments ? JSON.parse(tool.arguments) : {}
      } catch (e) {
        // Invalid JSON in tool arguments
      }

      contentBlocks.push({
        type: 'tool_use',
        input: toolArgs,
        name: toolName,
        id: toolCall.id?.length > 0 ? toolCall.id : nanoid(),
      })
    }
  }

  const record = message as unknown as Record<string, unknown>
  if (typeof record.reasoning === 'string' && record.reasoning) {
    contentBlocks.push({
      type: 'thinking',
      thinking: record.reasoning,
      signature: '',
    })
  }

  // NOTE: For deepseek api, the key for its returned reasoning process is reasoning_content
  if (
    typeof record.reasoning_content === 'string' &&
    record.reasoning_content
  ) {
    contentBlocks.push({
      type: 'thinking',
      thinking: record.reasoning_content,
      signature: '',
    })
  }

  if (message.content) {
    contentBlocks.push({
      type: 'text',
      text: message.content,
      citations: [],
    })
  }

  const finalMessage: AnthropicMessage = {
    id: nanoid(),
    model: response.model ?? '<openai>',
    role: 'assistant',
    content: contentBlocks,
    stop_reason: mapFinishReasonToStopReason(
      response.choices?.[0]?.finish_reason,
    ),
    stop_sequence: null,
    type: 'message',
    usage: {
      input_tokens: normalizedUsage.input_tokens ?? 0,
      output_tokens: normalizedUsage.output_tokens ?? 0,
      cache_creation_input_tokens:
        normalizedUsage.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: normalizedUsage.cache_read_input_tokens ?? 0,
    },
  }

  return finalMessage
}
