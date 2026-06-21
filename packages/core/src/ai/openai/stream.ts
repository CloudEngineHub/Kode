import type OpenAI from 'openai'
import type { Response } from 'undici'

import { debug as debugLogger } from '#core/utils/debugLogger'

export function createStreamProcessor(
  stream: NonNullable<Response['body']>,
  signal?: AbortSignal,
): AsyncGenerator<OpenAI.ChatCompletionChunk, void, unknown> {
  return (async function* () {
    const reader = stream.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''

    try {
      while (true) {
        if (signal?.aborted) break

        let readResult: Awaited<ReturnType<typeof reader.read>>
        try {
          readResult = await reader.read()
        } catch (e) {
          if (signal?.aborted) break
          debugLogger.warn('OPENAI_STREAM_READ_ERROR', {
            error: e instanceof Error ? e.message : String(e),
          })
          break
        }

        const { done, value } = readResult
        if (done) break

        const chunk = value instanceof Uint8Array ? value : new Uint8Array()
        buffer += decoder.decode(chunk, { stream: true })

        let lineEnd = buffer.indexOf('\n')
        while (lineEnd !== -1) {
          const line = buffer.substring(0, lineEnd).trim()
          buffer = buffer.substring(lineEnd + 1)

          if (line === 'data: [DONE]') {
            lineEnd = buffer.indexOf('\n')
            continue
          }

          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim()
            if (data) {
              try {
                yield JSON.parse(data) as OpenAI.ChatCompletionChunk
              } catch (e) {
                debugLogger.warn('OPENAI_STREAM_JSON_PARSE_ERROR', {
                  data,
                  error: e instanceof Error ? e.message : String(e),
                })
              }
            }
          }

          lineEnd = buffer.indexOf('\n')
        }
      }

      if (buffer.trim()) {
        const lines = buffer.trim().split('\n')
        for (const line of lines) {
          if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
          const data = line.slice(6).trim()
          if (!data) continue
          try {
            yield JSON.parse(data) as OpenAI.ChatCompletionChunk
          } catch (e) {
            debugLogger.warn('OPENAI_STREAM_FINAL_JSON_PARSE_ERROR', {
              data,
              error: e instanceof Error ? e.message : String(e),
            })
          }
        }
      }
    } catch (e) {
      debugLogger.warn('OPENAI_STREAM_UNEXPECTED_ERROR', {
        error: e instanceof Error ? e.message : String(e),
      })
    } finally {
      try {
        reader.releaseLock()
      } catch (e) {
        debugLogger.warn('OPENAI_STREAM_RELEASE_LOCK_ERROR', {
          error: e instanceof Error ? e.message : String(e),
        })
      }
    }
  })()
}

export function streamCompletion(
  stream: NonNullable<Response['body']>,
  signal?: AbortSignal,
): AsyncGenerator<OpenAI.ChatCompletionChunk, void, unknown> {
  return createStreamProcessor(stream, signal)
}
