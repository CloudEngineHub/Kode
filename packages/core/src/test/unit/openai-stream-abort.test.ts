import { describe, expect, test } from 'bun:test'
import { handleMessageStream } from '#core/ai/llm/openai/stream'

function chunk(delta: Record<string, unknown>) {
  return {
    id: 'chatcmpl_test',
    model: 'gpt-4',
    created: 1,
    object: 'chat.completion.chunk',
    choices: [{ index: 0, delta, finish_reason: null }],
  }
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
