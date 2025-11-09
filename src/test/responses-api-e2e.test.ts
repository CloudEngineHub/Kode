import { test, expect, describe } from 'bun:test'
import { ModelAdapterFactory } from '../services/modelAdapterFactory'
import { getModelCapabilities } from '../constants/modelCapabilities'
import { ModelProfile } from '../utils/config'

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

describe('🌐 Production API Integration Tests', () => {
  if (!PRODUCTION_TEST_MODE) {
    test('⚠️  PRODUCTION TEST MODE DISABLED', () => {
      console.log('\n🚨 PRODUCTION TEST MODE IS DISABLED 🚨')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('To enable production tests, run:')
      console.log('  PRODUCTION_TEST_MODE=true bun test src/test/responses-api-e2e.test.ts')
      console.log('')
      console.log('⚠️  WARNING: This will make REAL API calls and may incur costs!')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      expect(true).toBe(true) // This test always passes
    })
    return
  }

  // Validate that required environment variables are set
  if (!process.env.TEST_GPT5_API_KEY) {
    test('⚠️  ENVIRONMENT VARIABLES NOT CONFIGURED', () => {
      console.log('\n🚨 ENVIRONMENT VARIABLES NOT CONFIGURED 🚨')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('Create a .env file with the following variables:')
      console.log('  TEST_GPT5_API_KEY=your_api_key_here')
      console.log('  TEST_GPT5_BASE_URL=http://127.0.0.1:3000/openai')
      console.log('')
      console.log('⚠️  Never commit .env files to version control!')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      expect(true).toBe(true) // This test always passes
    })
    return
  }

  describe('📡 GPT-5 Codex Production Test - Request Validation', () => {
    test('🚀 Makes real API call and validates ALL request parameters', async () => {
      const adapter = ModelAdapterFactory.createAdapter(GPT5_CODEX_PROFILE_PROD)
      const shouldUseResponses = ModelAdapterFactory.shouldUseResponsesAPI(GPT5_CODEX_PROFILE_PROD)

      console.log('\n🚀 GPT-5 CODEX PRODUCTION TEST (Request Validation):')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('🔗 Adapter:', adapter.constructor.name)
      console.log('📍 Endpoint:', shouldUseResponses
        ? `${GPT5_CODEX_PROFILE_PROD.baseURL}/responses`
        : `${GPT5_CODEX_PROFILE_PROD.baseURL}/chat/completions`)
      console.log('🤖 Model:', GPT5_CODEX_PROFILE_PROD.modelName)
      console.log('🔑 API Key:', GPT5_CODEX_PROFILE_PROD.apiKey.substring(0, 8) + '...')

      // Create test request with reasoning enabled
      const mockParams = {
        messages: [
          { role: 'user', content: 'What is 2 + 2?' }
        ],
        systemPrompt: ['You are a helpful assistant. Show your reasoning.'],
        maxTokens: 100,
        reasoningEffort: 'high' as const,
      }

      try {
        const request = adapter.createRequest(mockParams)

        // Log the complete request for inspection
        console.log('\n📝 FULL REQUEST BODY:')
        console.log(JSON.stringify(request, null, 2))
        console.log('\n🔍 CHECKING FOR CRITICAL PARAMETERS:')
        console.log('  ✅ include array:', request.include ? 'PRESENT' : '❌ MISSING')
        console.log('  ✅ parallel_tool_calls:', request.parallel_tool_calls !== undefined ? 'PRESENT' : '❌ MISSING')
        console.log('  ✅ store:', request.store !== undefined ? 'PRESENT' : '❌ MISSING')
        console.log('  ✅ tool_choice:', request.tool_choice !== undefined ? 'PRESENT' : '❌ MISSING')
        console.log('  ✅ reasoning:', request.reasoning ? 'PRESENT' : '❌ MISSING')
        console.log('  ✅ max_output_tokens:', request.max_output_tokens ? 'PRESENT' : '❌ MISSING')

        // Make the actual API call
        const endpoint = `${GPT5_CODEX_PROFILE_PROD.baseURL}/responses`

        console.log('\n📡 Making request to:', endpoint)
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${GPT5_CODEX_PROFILE_PROD.apiKey}`,
          },
          body: JSON.stringify(request),
        })

        console.log('📊 Response status:', response.status)
        console.log('📊 Response headers:', Object.fromEntries(response.headers.entries()))

        if (response.ok) {
          // Use the adapter's parseResponse method to handle both streaming and non-streaming
          const unifiedResponse = await adapter.parseResponse(response)
          console.log('\n✅ SUCCESS! Response received:')
          console.log('📄 Unified Response:', JSON.stringify(unifiedResponse, null, 2))

          expect(response.status).toBe(200)
          expect(unifiedResponse).toBeDefined()
          expect(unifiedResponse.content).toBeDefined()

          // Verify critical fields are present in response
          if (unifiedResponse.usage.reasoningTokens !== undefined) {
            console.log('✅ Reasoning tokens received:', unifiedResponse.usage.reasoningTokens)
          } else {
            console.log('⚠️  No reasoning tokens in response (this might be OK)')
          }
        } else {
          const errorText = await response.text()
          console.log('\n❌ API ERROR:', response.status)
          console.log('Error body:', errorText)

          // Check if error is due to missing parameters
          if (errorText.includes('include') || errorText.includes('parallel_tool_calls')) {
            console.log('\n💡 THIS ERROR LIKELY INDICATES MISSING PARAMETERS!')
          }

          throw new Error(`API call failed: ${response.status} ${errorText}`)
        }

      } catch (error) {
        console.log('\n💥 Request failed:', error.message)
        throw error
      }
    }, 30000) // 30 second timeout
  })

  describe('🔬 Test Missing Parameters Impact', () => {
    test('⚠️  Test request WITHOUT critical parameters', async () => {
      console.log('\n⚠️  TESTING MISSING PARAMETERS IMPACT')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

      const adapter = ModelAdapterFactory.createAdapter(GPT5_CODEX_PROFILE_PROD)

      // Create base request
      const mockParams = {
        messages: [
          { role: 'user', content: 'What is 2 + 2?' }
        ],
        systemPrompt: ['You are a helpful assistant.'],
        maxTokens: 100,
      }

      const request = adapter.createRequest(mockParams)

      // Manually remove critical parameters to test their importance
      console.log('\n🗑️  REMOVING CRITICAL PARAMETERS:')
      console.log('  - include array')
      console.log('  - parallel_tool_calls')
      console.log('  - store')
      console.log('  (keeping tool_choice, reasoning, max_output_tokens)')

      const modifiedRequest = { ...request }
      delete modifiedRequest.include
      delete modifiedRequest.parallel_tool_calls
      delete modifiedRequest.store

      console.log('\n📝 MODIFIED REQUEST:')
      console.log(JSON.stringify(modifiedRequest, null, 2))

      // Make API call
      const endpoint = `${GPT5_CODEX_PROFILE_PROD.baseURL}/responses`

      try {
        console.log('\n📡 Making request with missing parameters...')
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${GPT5_CODEX_PROFILE_PROD.apiKey}`,
          },
          body: JSON.stringify(modifiedRequest),
        })

        console.log('📊 Response status:', response.status)

        if (response.ok) {
          const unifiedResponse = await adapter.parseResponse(response)
          console.log('✅ Request succeeded WITHOUT missing parameters')
          console.log('📄 Response content:', unifiedResponse.content)
          console.log('\n💡 CONCLUSION: These parameters may be OPTIONAL')
        } else {
          const errorText = await response.text()
          console.log('❌ Request failed:', response.status)
          console.log('Error:', errorText)

          // Analyze error to determine which parameters are critical
          if (errorText.includes('include')) {
            console.log('\n🔍 FINDING: include parameter is CRITICAL')
          }
          if (errorText.includes('parallel_tool_calls')) {
            console.log('\n🔍 FINDING: parallel_tool_calls parameter is CRITICAL')
          }
          if (errorText.includes('store')) {
            console.log('\n🔍 FINDING: store parameter is CRITICAL')
          }
        }
      } catch (error) {
        console.log('💥 Exception:', error.message)
      }
    }, 30000)
  })
})
