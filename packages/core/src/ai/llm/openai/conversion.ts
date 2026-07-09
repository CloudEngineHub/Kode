import OpenAI from 'openai'
import { nanoid } from 'nanoid'
import type { Tool } from '@kode/tool-interface/Tool'
import type { AssistantMessage, UserMessage } from '#core/query'
import { convertAnthropicMessagesToOpenAIMessages as convertAnthropicMessagesToOpenAIMessagesUtil } from '#core/utils/openaiMessageConversion'
import { API_ERROR_MESSAGE_PREFIX } from '#core/ai/llm/constants'
import { isOpenAIStreamDegradedResponse } from './stream'
import { normalizeUsage } from './usage'

function mapFinishReasonToStopReason(
  reason: OpenAI.ChatCompletion.Choice['finish_reason'] | null | undefined,
): AssistantMessage['message']['stop_reason'] {
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
  OpenAI.ChatCompletionMessageParam | OpenAI.ChatCompletionToolMessageParam
)[] {
  return convertAnthropicMessagesToOpenAIMessagesUtil(messages as any)
}

export function convertOpenAIResponseToAnthropic(
  response: OpenAI.ChatCompletion,
  tools?: Tool[],
): AssistantMessage['message'] {
  const normalizedUsage = normalizeUsage(response.usage)
  const contentBlocks: AssistantMessage['message']['content'] = []
  const streamDegraded = isOpenAIStreamDegradedResponse(response)
  const message = response.choices?.[0]?.message
  if (!message) {
    if (streamDegraded) {
      contentBlocks.push({
        type: 'text',
        text: formatOpenAIStreamDegradedError(response),
        citations: [],
      })
    }
    return {
      id: nanoid(),
      model: response.model ?? '<openai>',
      role: 'assistant',
      content: contentBlocks,
      stop_reason: mapFinishReasonToStopReason(
        response.choices?.[0]?.finish_reason,
      ),
      stop_sequence: null,
      type: 'message',
      usage: normalizedUsage,
    }
  }

  const droppedToolCalls =
    streamDegraded && Array.isArray(message.tool_calls)
      ? message.tool_calls.length
      : 0

  if (!streamDegraded && message?.tool_calls) {
    for (const toolCall of message.tool_calls) {
      if (toolCall.type !== 'function') continue
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

  if (streamDegraded) {
    contentBlocks.push({
      type: 'text',
      text: formatOpenAIStreamDegradedError(response, droppedToolCalls),
      citations: [],
    })
  }

  const finalMessage: AssistantMessage['message'] = {
    id: nanoid(),
    model: response.model ?? '<openai>',
    role: 'assistant',
    content: contentBlocks,
    stop_reason: mapFinishReasonToStopReason(
      response.choices?.[0]?.finish_reason,
    ),
    stop_sequence: null,
    type: 'message',
    usage: normalizedUsage,
  }

  return finalMessage
}

function formatOpenAIStreamDegradedError(
  response: OpenAI.ChatCompletion,
  droppedToolCalls = 0,
): string {
  const reason = isOpenAIStreamDegradedResponse(response)
    ? response.__streamDegradationReason
    : undefined
  const reasonText =
    typeof reason === 'string' && reason.length > 0 ? ` (${reason})` : ''
  const toolText =
    droppedToolCalls > 0
      ? ' Partial tool calls were discarded and were not executed.'
      : ''
  return `${API_ERROR_MESSAGE_PREFIX}: OpenAI-compatible stream ended before a complete response${reasonText}.${toolText} Please retry.`
}
