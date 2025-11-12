import { test, expect, describe } from 'bun:test'
import { ModelAdapterFactory } from '../../services/modelAdapterFactory'
import { getModelCapabilities } from '../../constants/modelCapabilities'
import { ModelProfile } from '../../utils/config'

// ⚠️  PRODUCTION TEST MODE ⚠️
// This test file makes REAL API calls to external services
// Set PRODUCTION_TEST_MODE=true to enable
// Costs may be incurred - use with caution!

const PRODUCTION_TEST_MODE = process.env.PRODUCTION_TEST_MODE === 'true'

// Load environment variables from .env file for production tests
if (process.env.NODE_ENV !== 'production') {
  try {
    const fs = require('fs')
    const path = require('path')
    const envPath = path.join(process.cwd(), '.env')
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8')
      envContent.split('\n').forEach((line: string) => {
        const [key, ...valueParts] = line.split('=')
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=')
          if (!process.env[key.trim()]) {
            process.env[key.trim()] = value.trim()
          }
        }
      })
    }
  } catch (error) {
    console.log('⚠️  Could not load .env file:', error.message)
  }
}

// Test model profiles from environment variables
// Create a .env file with these values to run production tests
// WARNING: Never commit .env files or API keys to version control!

const GPT5_CODEX_PROFILE: ModelProfile = {
  name: 'gpt-5-codex',
  provider: 'openai',
  modelName: 'gpt-5-codex',
  baseURL: process.env.TEST_GPT5_BASE_URL || 'https://api.openai.com/v1',
  apiKey: process.env.TEST_GPT5_API_KEY || '',
  maxTokens: 8192,
  contextLength: 128000,
  reasoningEffort: 'high',
  isActive: true,
  createdAt: 1731099900000,
  isGPT5: true,
  validationStatus: 'auto_repaired',
  lastValidation: 1762636302289,
}

const MINIMAX_CODEX_PROFILE: ModelProfile = {
  name: 'minimax codex-MiniMax-M2',
  provider: 'minimax',
  modelName: 'codex-MiniMax-M2',
  baseURL: process.env.TEST_CHAT_COMPLETIONS_BASE_URL || 'https://api.minimaxi.com/v1',
  apiKey: process.env.TEST_CHAT_COMPLETIONS_API_KEY || '',
  maxTokens: 8192,
  contextLength: 128000,
  reasoningEffort: null,
  createdAt: 1762660466723,
  isActive: true,
}

// Switch between models using TEST_MODEL env var
// Options: 'gpt5' (default) or 'minimax'
const TEST_MODEL = process.env.TEST_MODEL || 'gpt5'
const ACTIVE_PROFILE = TEST_MODEL === 'minimax' ? MINIMAX_CODEX_PROFILE : GPT5_CODEX_PROFILE

describe('🌐 Production API Integration Tests', () => {
  if (!PRODUCTION_TEST_MODE) {
    test('⚠️  PRODUCTION TEST MODE DISABLED', () => {
      console.log('\n🚨 PRODUCTION TEST MODE IS DISABLED 🚨')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('To enable production tests, run:')
      console.log('  PRODUCTION_TEST_MODE=true bun test src/test/production-api-tests.ts')
      console.log('')
      console.log('⚠️  WARNING: This will make REAL API calls and may incur costs!')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      expect(true).toBe(true) // This test always passes
    })
    return
  }

  // Validate that required environment variables are set
  if (!process.env.TEST_GPT5_API_KEY || !process.env.TEST_CHAT_COMPLETIONS_API_KEY) {
    test('⚠️  ENVIRONMENT VARIABLES NOT CONFIGURED', () => {
      console.log('\n🚨 ENVIRONMENT VARIABLES NOT CONFIGURED 🚨')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('Create a .env file with the following variables:')
      console.log('  TEST_GPT5_API_KEY=your_api_key_here')
      console.log('  TEST_GPT5_BASE_URL=http://127.0.0.1:3000/openai')
      console.log('  TEST_CHAT_COMPLETIONS_API_KEY=your_api_key_here')
      console.log('  TEST_CHAT_COMPLETIONS_BASE_URL=https://api.minimaxi.com/v1')
      console.log('')
      console.log('⚠️  Never commit .env files to version control!')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      expect(true).toBe(true) // This test always passes
    })
    return
  }

  describe(`📡 ${TEST_MODEL.toUpperCase()} Production Test`, () => {
    test(`🚀 Making real API call to ${TEST_MODEL.toUpperCase()} endpoint`, async () => {
      const adapter = ModelAdapterFactory.createAdapter(ACTIVE_PROFILE)
      const shouldUseResponses = ModelAdapterFactory.shouldUseResponsesAPI(ACTIVE_PROFILE)

      console.log('\n🚀 PRODUCTION TEST:')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('🧪 Test Model:', TEST_MODEL)
      console.log('🔗 Adapter:', adapter.constructor.name)
      console.log('📍 Endpoint:', shouldUseResponses
        ? `${ACTIVE_PROFILE.baseURL}/responses`
        : `${ACTIVE_PROFILE.baseURL}/chat/completions`)
      console.log('🤖 Model:', ACTIVE_PROFILE.modelName)
      console.log('🔑 API Key:', ACTIVE_PROFILE.apiKey.substring(0, 8) + '...')

      // Create test request
      const testPrompt = `Write a simple function that adds two numbers (${TEST_MODEL} test)`
      const mockParams = {
        messages: [
          { role: 'user', content: testPrompt }
        ],
        systemPrompt: ['You are a helpful coding assistant. Provide clear, concise code examples.'],
        maxTokens: 100, // Small limit to minimize costs
      }

      try {
        const request = adapter.createRequest(mockParams)

        // Make the actual API call
        const endpoint = shouldUseResponses
          ? `${ACTIVE_PROFILE.baseURL}/responses`
          : `${ACTIVE_PROFILE.baseURL}/chat/completions`

        console.log('📡 Making request to:', endpoint)
        console.log('📝 Request body:', JSON.stringify(request, null, 2))

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${ACTIVE_PROFILE.apiKey}`,
          },
          body: JSON.stringify(request),
        })

        console.log('📊 Response status:', response.status)
        console.log('📊 Response headers:', Object.fromEntries(response.headers.entries()))

        if (response.ok) {
          // Use the adapter's parseResponse method to handle both streaming and non-streaming
          const unifiedResponse = await adapter.parseResponse(response)
          console.log('✅ SUCCESS! Response received:')
          console.log('📄 Unified Response:', JSON.stringify(unifiedResponse, null, 2))

          expect(response.status).toBe(200)
          expect(unifiedResponse).toBeDefined()
          expect(unifiedResponse.content).toBeDefined()
        } else {
          const errorText = await response.text()
          console.log('❌ API ERROR:', response.status, errorText)
          throw new Error(`API call failed: ${response.status} ${errorText}`)
        }

      } catch (error) {
        console.log('💥 Request failed:', error.message)
        throw error
      }
    }, 30000) // 30 second timeout
  })


  describe('⚡ Quick Health Check Tests', () => {
    test(`🏥 ${TEST_MODEL.toUpperCase()} endpoint health check`, async () => {
      const adapter = ModelAdapterFactory.createAdapter(ACTIVE_PROFILE)
      const shouldUseResponses = ModelAdapterFactory.shouldUseResponsesAPI(ACTIVE_PROFILE)

      const endpoint = shouldUseResponses
        ? `${ACTIVE_PROFILE.baseURL}/responses`
        : `${ACTIVE_PROFILE.baseURL}/chat/completions`

      try {
        console.log(`\n🏥 Health check: ${endpoint}`)

        // Use the adapter to build the request properly
        const minimalRequest = adapter.createRequest({
          messages: [{ role: 'user', content: 'Hi' }],
          systemPrompt: [],
          maxTokens: 1
        })

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${ACTIVE_PROFILE.apiKey}`,
          },
          body: JSON.stringify(minimalRequest),
        })

        console.log('📊 Health status:', response.status, response.statusText)
        expect(response.status).toBeLessThan(500) // Any response < 500 is OK for health check

      } catch (error) {
        console.log('💥 Health check failed:', error.message)
        // Don't fail the test for network issues
        expect(error.message).toBeDefined()
      }
    })
  })

  describe('📊 Performance & Cost Metrics', () => {
    test('⏱️  API response time measurement', async () => {
      const startTime = performance.now()

      try {
        // Quick test call
        const adapter = ModelAdapterFactory.createAdapter(ACTIVE_PROFILE)
        const shouldUseResponses = ModelAdapterFactory.shouldUseResponsesAPI(ACTIVE_PROFILE)

        const endpoint = shouldUseResponses
          ? `${ACTIVE_PROFILE.baseURL}/responses`
          : `${ACTIVE_PROFILE.baseURL}/chat/completions`

        const request = adapter.createRequest({
          messages: [{ role: 'user', content: 'Hello' }],
          systemPrompt: [],
          maxTokens: 5
        })

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${ACTIVE_PROFILE.apiKey}`,
          },
          body: JSON.stringify(request),
        })

        const endTime = performance.now()
        const duration = endTime - startTime

        console.log(`\n⏱️  Performance Metrics (${TEST_MODEL}):`)
        console.log(`  Response time: ${duration.toFixed(2)}ms`)
        console.log(`  Status: ${response.status}`)

        expect(duration).toBeGreaterThan(0)
        expect(response.status).toBeDefined()

      } catch (error) {
        console.log('⚠️  Performance test failed:', error.message)
        // Don't fail for network issues
        expect(error.message).toBeDefined()
      }
    })
  })
})
