import { describe, expect, test } from 'bun:test'
import {
  OpenAIAdapter,
  type StreamingEvent,
} from '#core/ai/adapters/openaiAdapter'

class TestOpenAIAdapter extends OpenAIAdapter {
  constructor() {
    super({} as any, { modelName: 'test-model' } as any)
  }

  createRequest(): any {
    return {}
  }

  parseResponse(): Promise<any> {
    return Promise.resolve({})
  }

  protected async *processStreamingChunk(
    parsed: any,
    responseId: string,
    hasStarted: boolean,
  ): AsyncGenerator<StreamingEvent> {
    const delta = parsed?.choices?.[0]?.delta?.content
    if (typeof delta !== 'string') return

    for (const event of this.handleTextDelta(delta, responseId, hasStarted)) {
      yield event
    }
  }

  protected updateStreamingState(
    parsed: any,
    accumulatedContent: string,
  ): { content?: string; hasStarted?: boolean } {
    const delta = parsed?.choices?.[0]?.delta?.content
    if (typeof delta !== 'string' || delta.length === 0) return {}
    return {
      content: accumulatedContent + delta,
      hasStarted: true,
    }
  }

  protected parseNonStreamingResponse(): any {
    return {}
  }

  protected async parseStreamingOpenAIResponse(): Promise<any> {
    return {}
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

async function collectEvents(
  stream: AsyncGenerator<StreamingEvent>,
): Promise<StreamingEvent[]> {
  const events: StreamingEvent[] = []
  for await (const event of stream) {
    events.push(event)
  }
  return events
}

describe('base adapter parseStreamingResponse', () => {
  test('base adapter module can be imported', async () => {
    let importError: Error | null = null
    try {
      await import('#core/ai/adapters/base')
    } catch (e) {
      importError = e instanceof Error ? e : new Error(String(e))
    }
    expect(importError).toBeNull()
  })

  test('ModelAPIAdapter class exists and has expected structure', async () => {
    const mod = await import('#core/ai/adapters/base')
    expect(mod.ModelAPIAdapter).toBeDefined()
    expect(typeof mod.ModelAPIAdapter).toBe('function')
  })

  test('module exports expected symbols', async () => {
    const mod = await import('#core/ai/adapters/base')
    expect(mod.ModelAPIAdapter).toBeDefined()
    expect(typeof mod.normalizeTokens).toBe('function')
  })

  test('normalizeTokens is exported', async () => {
    const mod = await import('#core/ai/adapters/base')
    expect(typeof mod.normalizeTokens).toBe('function')
  })

  test('normalizeTokens handles null input', async () => {
    const mod = await import('#core/ai/adapters/base')
    const result = mod.normalizeTokens(null)
    expect(result).toEqual({ input: 0, output: 0 })
  })

  test('normalizeTokens handles standard API response', async () => {
    const mod = await import('#core/ai/adapters/base')
    const result = mod.normalizeTokens({
      prompt_tokens: 100,
      completion_tokens: 50,
    })
    expect(result.input).toBe(100)
    expect(result.output).toBe(50)
  })

  test('normalizeTokens handles alternative field names', async () => {
    const mod = await import('#core/ai/adapters/base')
    const result = mod.normalizeTokens({
      input_tokens: 200,
      output_tokens: 100,
    })
    expect(result.input).toBe(200)
    expect(result.output).toBe(100)
  })

  test('emits an error event for malformed SSE JSON after partial text', async () => {
    const adapter = new TestOpenAIAdapter()
    const validChunk = JSON.stringify({
      id: 'chatcmpl_test',
      choices: [{ delta: { content: 'partial' } }],
    })

    const events = await collectEvents(
      adapter.parseStreamingResponse({
        body: sseBody([`data: ${validChunk}`, 'data: {bad json}']),
      }),
    )

    expect(events.some(event => event.type === 'text_delta')).toBe(true)
    expect(
      events.some(
        event =>
          event.type === 'error' && event.error.includes('malformed JSON'),
      ),
    ).toBe(true)
  })
})
