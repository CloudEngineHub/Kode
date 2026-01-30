import type { ChatCompletionStream } from 'openai/lib/ChatCompletionStream'
import type OpenAI from 'openai'
import { debug as debugLogger } from '#core/utils/debugLogger'
import {
  setRequestStatus,
  setRequestInputTokens,
  updateRequestTokens,
} from '#core/utils/requestStatus'

function messageReducer(
  previous: OpenAI.ChatCompletionMessage,
  item: OpenAI.ChatCompletionChunk,
): OpenAI.ChatCompletionMessage {
  const reduce = (acc: any, delta: OpenAI.ChatCompletionChunk.Choice.Delta) => {
    acc = { ...acc }
    for (const [key, value] of Object.entries(delta)) {
      if (acc[key] === undefined || acc[key] === null) {
        acc[key] = value
        //  OpenAI.Chat.Completions.ChatCompletionMessageToolCall does not have a key, .index
        if (Array.isArray(acc[key])) {
          for (const arr of acc[key]) {
            delete arr.index
          }
        }
      } else if (typeof acc[key] === 'string' && typeof value === 'string') {
        acc[key] += value
      } else if (typeof acc[key] === 'number' && typeof value === 'number') {
        acc[key] = value
      } else if (Array.isArray(acc[key]) && Array.isArray(value)) {
        const accArray = acc[key]
        for (let i = 0; i < value.length; i++) {
          const { index, ...chunkTool } = value[i]
          if (index - accArray.length > 1) {
            throw new Error(
              `Error: An array has an empty value when tool_calls are constructed. tool_calls: ${accArray}; tool: ${value}`,
            )
          }
          accArray[index] = reduce(accArray[index], chunkTool)
        }
      } else if (typeof acc[key] === 'object' && typeof value === 'object') {
        acc[key] = reduce(acc[key], value)
      }
    }
    return acc
  }

  const choice = item.choices?.[0]
  if (!choice) {
    // chunk contains information about usage and token counts
    return previous
  }
  return reduce(previous, choice.delta) as OpenAI.ChatCompletionMessage
}

export async function handleMessageStream(
  stream: ChatCompletionStream,
  signal?: AbortSignal,
): Promise<OpenAI.ChatCompletion> {
  const streamStartTime = Date.now()
  let ttftMs: number | undefined
  let chunkCount = 0
  let errorCount = 0
  let hasMarkedStreaming = false
  let outputTokenCount = 0

  debugLogger.api('OPENAI_STREAM_START', {
    streamStartTime: String(streamStartTime),
  })

  let message = {} as OpenAI.ChatCompletionMessage

  let id, model, created, object, usage
  try {
    for await (const chunk of stream) {
      if (signal?.aborted) {
        debugLogger.flow('OPENAI_STREAM_ABORTED', {
          chunkCount,
          timestamp: Date.now(),
        })
        throw new Error('Request was cancelled')
      }

      chunkCount++

      try {
        if (!id) {
          id = chunk.id
          debugLogger.api('OPENAI_STREAM_ID_RECEIVED', {
            id,
            chunkNumber: String(chunkCount),
          })
        }
        if (!model) {
          model = chunk.model
          debugLogger.api('OPENAI_STREAM_MODEL_RECEIVED', {
            model,
            chunkNumber: String(chunkCount),
          })
        }
        if (!created) {
          created = chunk.created
        }
        if (!object) {
          object = chunk.object
        }
        if (!usage) {
          usage = chunk.usage
          if (chunk.usage?.prompt_tokens) {
            setRequestInputTokens(chunk.usage.prompt_tokens)
          }
        }

        message = messageReducer(message, chunk)

        if (chunk?.choices?.[0]?.delta?.content) {
          if (!hasMarkedStreaming) {
            setRequestStatus({ kind: 'streaming' })
            hasMarkedStreaming = true
          }
          outputTokenCount++
          updateRequestTokens(outputTokenCount)
          if (!ttftMs) {
            ttftMs = Date.now() - streamStartTime
            debugLogger.api('OPENAI_STREAM_FIRST_TOKEN', {
              ttftMs: String(ttftMs),
              chunkNumber: String(chunkCount),
            })
          }
        }

        if (chunk?.usage?.completion_tokens) {
          updateRequestTokens(chunk.usage.completion_tokens)
        }
      } catch (chunkError) {
        errorCount++
        debugLogger.error('OPENAI_STREAM_CHUNK_ERROR', {
          chunkNumber: String(chunkCount),
          errorMessage:
            chunkError instanceof Error
              ? chunkError.message
              : String(chunkError),
          errorType:
            chunkError instanceof Error
              ? chunkError.constructor.name
              : typeof chunkError,
        })
        // Continue processing other chunks
      }
    }

    debugLogger.api('OPENAI_STREAM_COMPLETE', {
      totalChunks: String(chunkCount),
      errorCount: String(errorCount),
      totalDuration: String(Date.now() - streamStartTime),
      ttftMs: String(ttftMs || 0),
      finalMessageId: id || 'undefined',
    })
  } catch (streamError) {
    debugLogger.error('OPENAI_STREAM_FATAL_ERROR', {
      totalChunks: String(chunkCount),
      errorCount: String(errorCount),
      errorMessage:
        streamError instanceof Error
          ? streamError.message
          : String(streamError),
      errorType:
        streamError instanceof Error
          ? streamError.constructor.name
          : typeof streamError,
    })
    throw streamError
  }
  return {
    id,
    created,
    model,
    object,
    choices: [
      {
        index: 0,
        message,
        finish_reason: 'stop',
        logprobs: undefined,
      },
    ],
    usage,
  }
}
