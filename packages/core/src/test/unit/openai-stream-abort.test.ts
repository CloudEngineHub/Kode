import { describe, expect, test } from 'bun:test'
import {
  handleMessageStream,
  isOpenAIStreamDegradedResponse,
} from '#core/ai/llm/openai/stream'
import { convertOpenAIResponseToAnthropic } from '#core/ai/llm/openai/conversion'
import { API_ERROR_MESSAGE_PREFIX } from '#core/ai/llm/constants'
import { createStreamProcessor } from '#core/ai/openai/stream'

function chunk(delta: Record<string, unknown>) {
  return {
    id: 'chatcmpl_test',
    model: 'gpt-4',
    created: 1,
    object: 'chat.completion.chunk',
    choices: [{ index: 0, delta, finish_reason: null }],
  }
}

function sseBody(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(`${line}\n`))
      }
      controller.close()
    },
  })
}

describe('OpenAI stream cancellation', () => {
  test('rejects when signal is aborted before reading stream chunks', async () => {
    const controller = new AbortController()
    controller.abort()

    async function* stream() {
      yield chunk({ content: 'late' })
    }

    await expect(
      handleMessageStream(stream() as any, controller.signal),
    ).rejects.toThrow('Request was cancelled')
  })

  test('does not return a partial response when signal aborts after a chunk', async () => {
    const controller = new AbortController()

    async function* stream() {
      yield chunk({ content: 'partial' })
      controller.abort()
    }

    await expect(
      handleMessageStream(stream() as any, controller.signal),
    ).rejects.toThrow('Request was cancelled')
  })
})

describe('OpenAI stream degradation', () => {
  test('rejects read failures before the first usable assistant token', async () => {
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new Error('socket closed'))
      },
    })

    await expect(
      handleMessageStream(createStreamProcessor(body as any) as any, undefined),
    ).rejects.toThrow('socket closed')
  })

  test('rejects malformed-only SSE instead of returning no content', async () => {
    const body = sseBody(['data: {bad json}'])

    await expect(
      handleMessageStream(createStreamProcessor(body as any) as any, undefined),
    ).rejects.toThrow('malformed JSON')
  })

  test('rejects SSE error payloads instead of returning no content', async () => {
    const body = sseBody(['data: {"error":{"message":"provider unavailable"}}'])

    await expect(
      handleMessageStream(createStreamProcessor(body as any) as any, undefined),
    ).rejects.toThrow('provider unavailable')
  })

  test('marks malformed SSE chunks as degraded without blocking partial output', async () => {
    const validChunk = JSON.stringify(chunk({ content: 'partial' }))
    const body = sseBody([`data: ${validChunk}`, 'data: {bad json}'])

    const result = await handleMessageStream(
      createStreamProcessor(body as any) as any,
      undefined,
    )

    expect(result.choices[0]?.message.content).toBe('partial')
    expect(result.choices[0]?.finish_reason).toBe('stop')
    expect(isOpenAIStreamDegradedResponse(result)).toBe(true)
  })

  test('marks stream read failures as degraded without blocking partial output', async () => {
    const encoder = new TextEncoder()
    const validChunk = JSON.stringify(chunk({ content: 'partial' }))
    let sent = false
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (!sent) {
          sent = true
          controller.enqueue(encoder.encode(`data: ${validChunk}\n`))
          return
        }
        controller.error(new Error('socket closed'))
      },
    })

    const result = await handleMessageStream(
      createStreamProcessor(body as any) as any,
      undefined,
    )

    expect(result.choices[0]?.message.content).toBe('partial')
    expect(result.choices[0]?.finish_reason).toBe('stop')
    expect(isOpenAIStreamDegradedResponse(result)).toBe(true)
  })

  test('converts thinking-only degraded streams into a visible API error', async () => {
    const validChunk = JSON.stringify(
      chunk({ reasoning_content: 'planning next steps' }),
    )
    const body = sseBody([`data: ${validChunk}`, 'data: {bad json}'])

    const result = await handleMessageStream(
      createStreamProcessor(body as any) as any,
      undefined,
    )
    const message = convertOpenAIResponseToAnthropic(result, [])
    const textBlocks = message.content.filter(block => block.type === 'text')

    expect(message.content.some(block => block.type === 'thinking')).toBe(true)
    expect(
      textBlocks.some(block => block.text.startsWith(API_ERROR_MESSAGE_PREFIX)),
    ).toBe(true)
    expect(textBlocks[0]?.text).toContain('json_parse_error')
  })

  test('converts reasoning-only completed streams into a visible API error', async () => {
    const validChunk = JSON.stringify(
      chunk({ reasoning_content: 'planning tool calls' }),
    )
    const body = sseBody([`data: ${validChunk}`, 'data: [DONE]'])

    const result = await handleMessageStream(
      createStreamProcessor(body as any) as any,
      undefined,
    )
    const message = convertOpenAIResponseToAnthropic(result, [])
    const textBlocks = message.content.filter(block => block.type === 'text')

    expect(isOpenAIStreamDegradedResponse(result)).toBe(true)
    expect(message.content.some(block => block.type === 'thinking')).toBe(true)
    expect(textBlocks[0]?.text).toContain(
      'OpenAI-compatible stream ended before a complete response',
    )
    expect(textBlocks[0]?.text).toContain('empty_response')
  })

  test('drops partial tool calls from degraded streams', async () => {
    const validChunk = JSON.stringify(
      chunk({
        tool_calls: [
          {
            index: 0,
            id: 'call_1',
            type: 'function',
            function: {
              name: 'Task',
              arguments: '{"description":"test"}',
            },
          },
        ],
      }),
    )
    const body = sseBody([`data: ${validChunk}`, 'data: {bad json}'])

    const result = await handleMessageStream(
      createStreamProcessor(body as any) as any,
      undefined,
    )
    const message = convertOpenAIResponseToAnthropic(result, [])
    const textBlocks = message.content.filter(block => block.type === 'text')

    expect(message.content.some(block => block.type === 'tool_use')).toBe(false)
    expect(textBlocks[0]?.text).toContain('Partial tool calls were discarded')
  })
})
