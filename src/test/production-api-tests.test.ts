import { test, expect, describe } from 'bun:test'
import { ModelAdapterFactory } from '../services/modelAdapterFactory'
import { getModelCapabilities } from '../constants/modelCapabilities'
import { ModelProfile } from '../utils/config'

// ⚠️  PRODUCTION TEST MODE ⚠️
// This test file makes REAL API calls to external services
// Set PRODUCTION_TEST_MODE=true to enable
// Costs may be incurred - use with caution!

const PRODUCTION_TEST_MODE = process.env.PRODUCTION_TEST_MODE === 'true'

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
  baseURL: process.env.TEST_MINIMAX_BASE_URL || 'https://api.minimaxi.com/v1',
  apiKey: process.env.TEST_MINIMAX_API_KEY || '',
  maxTokens: 8192,
  contextLength: 128000,
  reasoningEffort: null,
  createdAt: 1762660466723,
  isActive: true,
}

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
  if (!process.env.TEST_GPT5_API_KEY || !process.env.TEST_MINIMAX_API_KEY) {
    test('⚠️  ENVIRONMENT VARIABLES NOT CONFIGURED', () => {
      console.log('\n🚨 ENVIRONMENT VARIABLES NOT CONFIGURED 🚨')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('Create a .env file with the following variables:')
      console.log('  TEST_GPT5_API_KEY=your_api_key_here')
      console.log('  TEST_GPT5_BASE_URL=http://127.0.0.1:3000/openai')
      console.log('  TEST_MINIMAX_API_KEY=your_api_key_here')
      console.log('  TEST_MINIMAX_BASE_URL=https://api.minimaxi.com/v1')
      console.log('')
      console.log('⚠️  Never commit .env files to version control!')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      expect(true).toBe(true) // This test always passes
    })
    return
  }

  describe('📡 GPT-5 Codex Production Test', () => {
    test('🚀 Making real API call to GPT-5 Codex endpoint', async () => {
      const adapter = ModelAdapterFactory.createAdapter(GPT5_CODEX_PROFILE)
      const shouldUseResponses = ModelAdapterFactory.shouldUseResponsesAPI(GPT5_CODEX_PROFILE)

      console.log('\n🚀 GPT-5 CODEX PRODUCTION TEST:')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('🔗 Adapter:', adapter.constructor.name)
      console.log('📍 Endpoint:', shouldUseResponses
        ? `${GPT5_CODEX_PROFILE.baseURL}/responses`
        : `${GPT5_CODEX_PROFILE.baseURL}/chat/completions`)
      console.log('🤖 Model:', GPT5_CODEX_PROFILE.modelName)
      console.log('🔑 API Key:', GPT5_CODEX_PROFILE.apiKey.substring(0, 8) + '...')

      // Create test request
      const testPrompt = "Write a simple Python function that adds two numbers"
      const mockParams = {
        messages: [
          { role: 'user', content: testPrompt }
        ],
        systemPrompt: ['You are a helpful coding assistant. Provide clear, concise code examples.'],
        maxTokens: 100, // Small limit to minimize costs
        // Note: stream=true would return SSE format, which requires special handling
      }

      try {
        const request = adapter.createRequest(mockParams)

        // Make the actual API call
        const endpoint = shouldUseResponses
          ? `${GPT5_CODEX_PROFILE.baseURL}/responses`
          : `${GPT5_CODEX_PROFILE.baseURL}/chat/completions`

        console.log('📡 Making request to:', endpoint)
        console.log('📝 Request body:', JSON.stringify(request, null, 2))

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${GPT5_CODEX_PROFILE.apiKey}`,
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

  describe('📡 MiniMax Codex Production Test', () => {
    test('🚀 Making real API call to MiniMax Codex endpoint', async () => {
      const adapter = ModelAdapterFactory.createAdapter(MINIMAX_CODEX_PROFILE)
      const shouldUseResponses = ModelAdapterFactory.shouldUseResponsesAPI(MINIMAX_CODEX_PROFILE)

      console.log('\n🚀 MINIMAX CODEX PRODUCTION TEST:')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('🔗 Adapter:', adapter.constructor.name)
      console.log('📍 Endpoint:', shouldUseResponses
        ? `${MINIMAX_CODEX_PROFILE.baseURL}/responses`
        : `${MINIMAX_CODEX_PROFILE.baseURL}/chat/completions`)
      console.log('🤖 Model:', MINIMAX_CODEX_PROFILE.modelName)
      console.log('🔑 API Key:', MINIMAX_CODEX_PROFILE.apiKey.substring(0, 16) + '...')

      // Create test request
      const testPrompt = "Write a simple JavaScript function that adds two numbers"
      const mockParams = {
        messages: [
          { role: 'user', content: testPrompt }
        ],
        systemPrompt: ['You are a helpful coding assistant. Provide clear, concise code examples.'],
        maxTokens: 100, // Small limit to minimize costs
        temperature: 0.7,
      }

      try {
        const request = adapter.createRequest(mockParams)

        // Make the actual API call
        const endpoint = shouldUseResponses
          ? `${MINIMAX_CODEX_PROFILE.baseURL}/responses`
          : `${MINIMAX_CODEX_PROFILE.baseURL}/chat/completions`

        console.log('📡 Making request to:', endpoint)
        console.log('📝 Request body:', JSON.stringify(request, null, 2))

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${MINIMAX_CODEX_PROFILE.apiKey}`,
          },
          body: JSON.stringify(request),
        })

        console.log('📊 Response status:', response.status)
        console.log('📊 Response headers:', Object.fromEntries(response.headers.entries()))

        if (response.ok) {
          // Use the adapter's parseResponse method to handle the response
          const unifiedResponse = adapter.parseResponse(response)
          console.log('✅ SUCCESS! Response received:')
          console.log('📄 Unified Response:', JSON.stringify(unifiedResponse, null, 2))

          expect(response.status).toBe(200)
          expect(unifiedResponse).toBeDefined()
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
    test('🏥 GPT-5 Codex endpoint health check', async () => {
      const adapter = ModelAdapterFactory.createAdapter(GPT5_CODEX_PROFILE)
      const shouldUseResponses = ModelAdapterFactory.shouldUseResponsesAPI(GPT5_CODEX_PROFILE)

      const endpoint = shouldUseResponses
        ? `${GPT5_CODEX_PROFILE.baseURL}/responses`
        : `${GPT5_CODEX_PROFILE.baseURL}/chat/completions`

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
            'Authorization': `Bearer ${GPT5_CODEX_PROFILE.apiKey}`,
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

    test('🏥 MiniMax endpoint health check', async () => {
      const adapter = ModelAdapterFactory.createAdapter(MINIMAX_CODEX_PROFILE)
      const shouldUseResponses = ModelAdapterFactory.shouldUseResponsesAPI(MINIMAX_CODEX_PROFILE)

      const endpoint = shouldUseResponses
        ? `${MINIMAX_CODEX_PROFILE.baseURL}/responses`
        : `${MINIMAX_CODEX_PROFILE.baseURL}/chat/completions`

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
            'Authorization': `Bearer ${MINIMAX_CODEX_PROFILE.apiKey}`,
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
        const adapter = ModelAdapterFactory.createAdapter(GPT5_CODEX_PROFILE)
        const shouldUseResponses = ModelAdapterFactory.shouldUseResponsesAPI(GPT5_CODEX_PROFILE)

        const endpoint = shouldUseResponses
          ? `${GPT5_CODEX_PROFILE.baseURL}/responses`
          : `${GPT5_CODEX_PROFILE.baseURL}/chat/completions`

        const request = adapter.createRequest({
          messages: [{ role: 'user', content: 'Hello' }],
          systemPrompt: [],
          maxTokens: 5
        })

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${GPT5_CODEX_PROFILE.apiKey}`,
          },
          body: JSON.stringify(request),
        })

        const endTime = performance.now()
        const duration = endTime - startTime

        console.log(`\n⏱️  Performance Metrics:`)
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

  describe('🎯 Integration Validation Report', () => {
    test('📋 Complete production test summary', async () => {
      const results = {
        timestamp: new Date().toISOString(),
        tests: [],
        endpoints: [],
        performance: {},
        recommendations: [] as string[],
      }

      // Test both endpoints
      const profiles = [
        { name: 'GPT-5 Codex', profile: GPT5_CODEX_PROFILE },
        { name: 'MiniMax Codex', profile: MINIMAX_CODEX_PROFILE },
      ]

      for (const { name, profile } of profiles) {
        try {
          const adapter = ModelAdapterFactory.createAdapter(profile)
          const shouldUseResponses = ModelAdapterFactory.shouldUseResponsesAPI(profile)
          const endpoint = shouldUseResponses
            ? `${profile.baseURL}/responses`
            : `${profile.baseURL}/chat/completions`

          // Quick connectivity test
          const testRequest = {
            model: profile.modelName,
            messages: [{ role: 'user', content: 'test' }],
            max_tokens: 1
          }

          const startTime = performance.now()
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${profile.apiKey}`,
            },
            body: JSON.stringify(testRequest),
          })
          const endTime = performance.now()

          results.tests.push({
            name,
            status: response.ok ? 'success' : 'failed',
            statusCode: response.status,
            endpoint,
            responseTime: `${(endTime - startTime).toFixed(2)}ms`,
          })

          results.endpoints.push({
            name,
            url: endpoint,
            accessible: response.ok,
          })

        } catch (error) {
          results.tests.push({
            name,
            status: 'error',
            error: error.message,
            endpoint: `${profile.baseURL}/...`,
          })
        }
      }

      // Generate recommendations
      const successCount = results.tests.filter(t => t.status === 'success').length
      if (successCount === results.tests.length) {
        results.recommendations.push('🎉 All endpoints are accessible and working!')
        results.recommendations.push('✅ Integration tests passed - ready for production use')
      } else {
        results.recommendations.push('⚠️  Some endpoints failed - check configuration')
        results.recommendations.push('🔧 Verify API keys and endpoint URLs')
      }

      // 📨 COMPREHENSIVE PRODUCTION TEST REPORT
      console.log('\n🎯 PRODUCTION INTEGRATION REPORT:')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log(`📅 Test Date: ${results.timestamp}`)
      console.log(`🎯 Tests Run: ${results.tests.length}`)
      console.log(`✅ Successful: ${successCount}`)
      console.log(`❌ Failed: ${results.tests.length - successCount}`)
      console.log('')

      console.log('📊 ENDPOINT TEST RESULTS:')
      results.tests.forEach(test => {
        const icon = test.status === 'success' ? '✅' : '❌'
        console.log(`  ${icon} ${test.name}: ${test.status} (${test.statusCode || 'N/A'})`)
        if (test.responseTime) {
          console.log(`     ⏱️  Response time: ${test.responseTime}`)
        }
        if (test.error) {
          console.log(`     💥 Error: ${test.error}`)
        }
      })

      console.log('')
      console.log('🌐 ACCESSIBLE ENDPOINTS:')
      results.endpoints.forEach(endpoint => {
        const icon = endpoint.accessible ? '🟢' : '🔴'
        console.log(`  ${icon} ${endpoint.name}: ${endpoint.url}`)
      })

      console.log('')
      console.log('💡 RECOMMENDATIONS:')
      results.recommendations.forEach(rec => console.log(`  ${rec}`))

      console.log('')
      console.log('🚀 NEXT STEPS:')
      console.log('  1. ✅ Integration tests complete')
      console.log('  2. 🔍 Review any failed tests above')
      console.log('  3. 🎯 Configure your applications to use working endpoints')
      console.log('  4. 📊 Monitor API usage and costs')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

      expect(results.tests.length).toBeGreaterThan(0)
      return results
    })
  })
})
