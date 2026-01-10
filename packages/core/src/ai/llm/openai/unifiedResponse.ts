import { nanoid } from 'nanoid'
import { randomUUID } from 'crypto'
import type { UUID } from 'crypto'
import type { AssistantMessage } from '#core/query'

export function buildAssistantMessageFromUnifiedResponse(
  unifiedResponse: any,
  startTime: number,
): AssistantMessage {
  const contentBlocks = [...(unifiedResponse.content || [])]

  if (unifiedResponse.toolCalls && unifiedResponse.toolCalls.length > 0) {
    for (const toolCall of unifiedResponse.toolCalls) {
      const tool = toolCall.function
      const toolName = tool?.name
      let toolArgs = {}
      try {
        toolArgs = tool?.arguments ? JSON.parse(tool.arguments) : {}
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

  const inputTokens =
    unifiedResponse.usage?.promptTokens ??
    unifiedResponse.usage?.input_tokens ??
    0
  const outputTokens =
    unifiedResponse.usage?.completionTokens ??
    unifiedResponse.usage?.output_tokens ??
    0

  return {
    type: 'assistant',
    message: {
      id: unifiedResponse.responseId ?? nanoid(),
      model: unifiedResponse.model ?? '',
      role: 'assistant',
      type: 'message',
      stop_reason: unifiedResponse.stopReason ?? null,
      stop_sequence: null,
      content: contentBlocks,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    },
    costUSD: 0,
    durationMs: Date.now() - startTime,
    uuid: randomUUID() as UUID,
    responseId: unifiedResponse.responseId,
  }
}
