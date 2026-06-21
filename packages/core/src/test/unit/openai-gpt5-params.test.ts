import { describe, expect, test } from 'bun:test'
import { buildOpenAIChatCompletionCreateParams } from '#core/ai/llm/openai'

describe('OpenAI Chat Completions params (GPT-5 branch)', () => {
  test('GPT-5 models use max_completion_tokens (not max_tokens)', () => {
    const params = buildOpenAIChatCompletionCreateParams({
      model: 'gpt-5-mini',
      maxTokens: 123,
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 1,
      stream: false,
      toolSchemas: [],
    })

    expect(params.max_completion_tokens).toBe(123)
    expect(params.max_tokens).toBeUndefined()
  })

  test('non GPT-5 models use max_tokens (not max_completion_tokens)', () => {
    const params = buildOpenAIChatCompletionCreateParams({
      model: 'gpt-4o-mini',
      maxTokens: 456,
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0.7,
      stream: false,
      toolSchemas: [],
    })

    expect(params.max_tokens).toBe(456)
    expect(params.max_completion_tokens).toBeUndefined()
  })

  test('stream/tools/stop/reasoning flags are wired', () => {
    const params = buildOpenAIChatCompletionCreateParams({
      model: 'gpt-5',
      maxTokens: 42,
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 1,
      stream: true,
      stopSequences: ['STOP'],
      reasoningEffort: 'medium',
      toolSchemas: [
        {
          type: 'function',
          function: {
            name: 'TestTool',
            description: 'x',
            parameters: {},
          },
        },
      ],
    })

    expect(params.stream).toBe(true)
    expect(params.stream_options?.include_usage).toBe(true)
    expect(params.stop).toEqual(['STOP'])
    expect(params.tool_choice).toBe('auto')
    expect(Array.isArray(params.tools)).toBe(true)
    expect(params.tools.length).toBe(1)
    expect(params.reasoning_effort).toBe('medium')
  })
})
