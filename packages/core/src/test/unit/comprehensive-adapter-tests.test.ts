import { test, expect, describe } from 'bun:test'
import { ModelAdapterFactory } from '#core/ai/modelAdapterFactory'
import { getModelCapabilities } from '../../constants/modelCapabilities'
import { testModels } from '../testAdapters'

describe('Model Adapter Tests', () => {
  describe('Adapter Selection', () => {
    test.each(testModels)('$name uses correct adapter', model => {
      const adapter = ModelAdapterFactory.createAdapter(model)
      const shouldUseResponses =
        ModelAdapterFactory.shouldUseResponsesAPI(model)

      const expectedAdapter = shouldUseResponses
        ? 'ResponsesAPIAdapter'
        : 'ChatCompletionsAdapter'
      expect(adapter.constructor.name).toBe(expectedAdapter)
    })
  })

  describe('Architecture Validation', () => {
    test('Chat Completions models use ChatCompletionsAdapter', () => {
      const chatModels = testModels.filter(model => {
        const shouldUseResponses =
          ModelAdapterFactory.shouldUseResponsesAPI(model)
        return !shouldUseResponses
      })

      chatModels.forEach(model => {
        const adapter = ModelAdapterFactory.createAdapter(model)
        expect(adapter.constructor.name).toBe('ChatCompletionsAdapter')
      })
    })

    test('Responses API models use ResponsesAPIAdapter', () => {
      const responsesModels = testModels.filter(model => {
        const shouldUseResponses =
          ModelAdapterFactory.shouldUseResponsesAPI(model)
        return shouldUseResponses
      })

      responsesModels.forEach(model => {
        const adapter = ModelAdapterFactory.createAdapter(model)
        expect(adapter.constructor.name).toBe('ResponsesAPIAdapter')
      })
    })

    test('GPT-5-compatible third-party endpoints use Chat Completions fallback', () => {
      const model = {
        name: 'OpenRouter GPT-5',
        modelName: 'openai/gpt-5',
        provider: 'openrouter',
        apiKey: 'test-key',
        baseURL: 'https://openrouter.ai/api/v1',
        maxTokens: 8192,
        contextLength: 128000,
        isActive: true,
        createdAt: Date.now(),
      }

      expect(ModelAdapterFactory.shouldUseResponsesAPI(model)).toBe(false)
      expect(ModelAdapterFactory.createAdapter(model).constructor.name).toBe(
        'ChatCompletionsAdapter',
      )
    })
  })

  test('model capabilities are correctly identified', () => {
    testModels.forEach(model => {
      const capabilities = getModelCapabilities(model.modelName)

      expect(capabilities.apiArchitecture.primary).toBeDefined()
      expect(capabilities.parameters.maxTokensField).toBeDefined()
      expect(capabilities.toolCalling.mode).toBeDefined()
      expect(capabilities.streaming.supported).toBeDefined()
    })
  })

  test('request format matches adapter type', () => {
    const unifiedParams = {
      messages: [{ role: 'user', content: 'Test message' }],
      systemPrompt: ['You are a helpful assistant'],
      tools: [],
      maxTokens: 100,
      stream: true,
      temperature: 0.7,
    }

    testModels.forEach(model => {
      const adapter = ModelAdapterFactory.createAdapter(model)
      const request = adapter.createRequest(unifiedParams)
      const shouldUseResponses =
        ModelAdapterFactory.shouldUseResponsesAPI(model)

      expect(request.model).toBe(model.modelName)

      if (shouldUseResponses) {
        expect(request).toHaveProperty('input')
        expect(request).toHaveProperty('max_output_tokens')
        expect(request.stream).toBe(true)
      } else {
        expect(request).toHaveProperty('messages')
        const hasMaxTokens =
          request.hasOwnProperty('max_tokens') ||
          request.hasOwnProperty('max_completion_tokens')
        expect(hasMaxTokens).toBe(true)
        expect(request).not.toHaveProperty('include')
        expect(request).not.toHaveProperty('max_output_tokens')
      }
    })
  })
})
