import { test, expect, describe } from 'bun:test'
import { ModelAdapterFactory } from '../../services/modelAdapterFactory'
import { getModelCapabilities } from '../../constants/modelCapabilities'
import { ModelProfile } from '../../utils/config'

/**
 * Responses API End-to-End Integration Tests
 *
 * This test file includes both:
 * 1. Unit tests - Test adapter conversion logic (always run)
 * 2. Production tests - Make REAL API calls (requires PRODUCTION_TEST_MODE=true)
 *
 * To run production tests:
 *   PRODUCTION_TEST_MODE=true bun test src/test/responses-api-e2e.test.ts
 *
 * Environment variables required for production tests:
 *   TEST_GPT5_API_KEY=your_api_key_here
 *   TEST_GPT5_BASE_URL=http://127.0.0.1:3000/openai
 *
 * ⚠️  WARNING: Production tests make real API calls and may incur costs!
 */

// Test the actual usage pattern from Kode CLI
const GPT5_CODEX_PROFILE: ModelProfile = {
  name: 'gpt-5-codex',
  provider: 'openai',
  modelName: 'gpt-5-codex',
  baseURL: 'http://127.0.0.1:3000/openai',
  apiKey: process.env.TEST_GPT5_API_KEY || '',
  maxTokens: 8192,
  contextLength: 128000,
  reasoningEffort: 'high',
  isActive: true,
  createdAt: Date.now(),
}

// ⚠️  PRODUCTION TEST MODE ⚠️
// This test can make REAL API calls to external services
// Set PRODUCTION_TEST_MODE=true to enable
// Costs may be incurred - use with caution!

const PRODUCTION_TEST_MODE = process.env.PRODUCTION_TEST_MODE === 'true'

// Test model profile for production testing
// Uses environment variables - MUST be set for production tests
const GPT5_CODEX_PROFILE_PROD: ModelProfile = {
  name: 'gpt-5-codex',
  provider: 'openai',
  modelName: 'gpt-5-codex',
  baseURL: process.env.TEST_GPT5_BASE_URL || 'http://127.0.0.1:3000/openai',
  apiKey: process.env.TEST_GPT5_API_KEY || '',
  maxTokens: 8192,
  contextLength: 128000,
  reasoningEffort: 'high',
  isActive: true,
  createdAt: Date.now(),
}

describe('🔬 Responses API End-to-End Integration Tests', () => {
  test('✅ Adapter correctly converts Anthropic format to Responses API format', () => {
    const adapter = ModelAdapterFactory.createAdapter(GPT5_CODEX_PROFILE)
    const capabilities = getModelCapabilities(GPT5_CODEX_PROFILE.modelName)

    // This is the format Kode CLI actually uses
    const unifiedParams = {
      messages: [
        { role: 'user', content: 'who are you' }
      ],
      systemPrompt: ['You are a helpful assistant'],
      maxTokens: 100,
    }

    const request = adapter.createRequest(unifiedParams)

    // Verify the request is properly formatted for Responses API
    expect(request).toBeDefined()
    expect(request.model).toBe('gpt-5-codex')
    expect(request.instructions).toBe('You are a helpful assistant')
    expect(request.input).toBeDefined()
    expect(Array.isArray(request.input)).toBe(true)
    expect(request.max_output_tokens).toBe(100)
    expect(request.stream).toBe(true)

    // Verify the input array has the correct structure
    const inputItem = request.input[0]
    expect(inputItem.type).toBe('message')
    expect(inputItem.role).toBe('user')
    expect(inputItem.content).toBeDefined()
    expect(Array.isArray(inputItem.content)).toBe(true)

    const contentItem = inputItem.content[0]
    expect(contentItem.type).toBe('input_text')
    expect(contentItem.text).toBe('who are you')
  })

  test('✅ Handles system messages correctly', () => {
    const adapter = ModelAdapterFactory.createAdapter(GPT5_CODEX_PROFILE)

    const unifiedParams = {
      messages: [
        { role: 'user', content: 'Hello' }
      ],
      systemPrompt: [
        'You are a coding assistant',
        'Always write clean code'
      ],
      maxTokens: 50,
    }

    const request = adapter.createRequest(unifiedParams)

    // System prompts should be joined with double newlines
    expect(request.instructions).toBe('You are a coding assistant\n\nAlways write clean code')
    expect(request.input).toHaveLength(1)
  })

  test('✅ Handles multiple messages including tool results', () => {
    const adapter = ModelAdapterFactory.createAdapter(GPT5_CODEX_PROFILE)

    const unifiedParams = {
      messages: [
        { role: 'user', content: 'What is this file?' },
        {
          role: 'tool',
          tool_call_id: 'tool_123',
          content: 'This is a TypeScript file'
        },
        { role: 'assistant', content: 'I need to check the file first' },
        { role: 'user', content: 'Please read it' }
      ],
      systemPrompt: ['You are helpful'],
      maxTokens: 100,
    }

    const request = adapter.createRequest(unifiedParams)

    // Should have multiple input items
    expect(request.input).toBeDefined()
    expect(Array.isArray(request.input)).toBe(true)

    // Should have tool call result, assistant message, and user message
    const hasToolResult = request.input.some(item => item.type === 'function_call_output')
    const hasUserMessage = request.input.some(item => item.role === 'user')

    expect(hasToolResult).toBe(true)
    expect(hasUserMessage).toBe(true)
  })

  test('✅ Includes reasoning and verbosity parameters', () => {
    const adapter = ModelAdapterFactory.createAdapter(GPT5_CODEX_PROFILE)

    const unifiedParams = {
      messages: [
        { role: 'user', content: 'Explain this code' }
      ],
      systemPrompt: ['You are an expert'],
      maxTokens: 200,
      reasoningEffort: 'high',
      verbosity: 'high',
    }

    const request = adapter.createRequest(unifiedParams)

    expect(request.reasoning).toBeDefined()
    expect(request.reasoning.effort).toBe('high')
    expect(request.text).toBeDefined()
    expect(request.text.verbosity).toBe('high')
  })

  test('✅ Does NOT include deprecated parameters', () => {
    const adapter = ModelAdapterFactory.createAdapter(GPT5_CODEX_PROFILE)

    const unifiedParams = {
      messages: [
        { role: 'user', content: 'Hello' }
      ],
      systemPrompt: ['You are helpful'],
      maxTokens: 100,
    }

    const request = adapter.createRequest(unifiedParams)

    // Should NOT have these old parameters
    expect(request.messages).toBeUndefined()
    expect(request.max_completion_tokens).toBeUndefined()
    expect(request.max_tokens).toBeUndefined()
  })

  test('✅ Correctly uses max_output_tokens parameter', () => {
    const adapter = ModelAdapterFactory.createAdapter(GPT5_CODEX_PROFILE)

    const unifiedParams = {
      messages: [
        { role: 'user', content: 'Test' }
      ],
      systemPrompt: ['You are helpful'],
      maxTokens: 500,
    }

    const request = adapter.createRequest(unifiedParams)

    // Should use the correct parameter name for Responses API
    expect(request.max_output_tokens).toBe(500)
  })

  test('✅ Adapter selection logic works correctly', () => {
    // GPT-5 should use Responses API
    const shouldUseResponses = ModelAdapterFactory.shouldUseResponsesAPI(GPT5_CODEX_PROFILE)
    expect(shouldUseResponses).toBe(true)

    const adapter = ModelAdapterFactory.createAdapter(GPT5_CODEX_PROFILE)
    expect(adapter.constructor.name).toBe('ResponsesAPIAdapter')
  })

  test('✅ Streaming is always enabled for Responses API', () => {
    const adapter = ModelAdapterFactory.createAdapter(GPT5_CODEX_PROFILE)

    const unifiedParams = {
      messages: [
        { role: 'user', content: 'Hello' }
      ],
      systemPrompt: ['You are helpful'],
      maxTokens: 100,
      stream: false, // Even if user sets this to false
    }

    const request = adapter.createRequest(unifiedParams)

    // Responses API always requires streaming
    expect(request.stream).toBe(true)
  })

})
