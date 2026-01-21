/**
 * Integration Test: Full CLI Flow (Model-Agnostic)
 *
 * This test exercises the same code path the CLI uses:
 * llm.ts → ModelAdapterFactory → adapter → API
 */

import { describe, expect, test } from 'bun:test'
import { ModelAdapterFactory } from '#core/ai/modelAdapterFactory'
import { callGPT5ResponsesAPI } from '#core/ai/openai'
import {
  ACTIVE_PRODUCTION_MODELS,
  TEST_MODEL,
  expectUnifiedUsage,
  getActiveProfile,
} from './integration-cli-flow.shared'

describe('🔌 Integration: Full CLI Flow (Model-Agnostic)', () => {
  if (ACTIVE_PRODUCTION_MODELS.length === 0) {
    test.skip('✅ End-to-end flow through CLI path (requires API keys)', () => {})
    return
  }

  test('✅ End-to-end flow through CLI path', async () => {
    const ACTIVE_PROFILE = getActiveProfile()

    console.log('\n🔧 TEST CONFIGURATION:')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`  🧪 Test Model: ${TEST_MODEL}`)
    console.log(`  📝 Model Name: ${ACTIVE_PROFILE.modelName}`)
    console.log(`  🏢 Provider: ${ACTIVE_PROFILE.provider}`)
    console.log(
      `  🔗 Adapter: ${ModelAdapterFactory.createAdapter(ACTIVE_PROFILE).constructor.name}`,
    )
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('\n🔌 INTEGRATION TEST: Full Flow')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    try {
      console.log('Step 1: Creating adapter...')
      const adapter = ModelAdapterFactory.createAdapter(ACTIVE_PROFILE)
      console.log(`  ✅ Adapter: ${adapter.constructor.name}`)

      console.log('\nStep 2: Checking if should use Responses API...')
      const shouldUseResponses =
        ModelAdapterFactory.shouldUseResponsesAPI(ACTIVE_PROFILE)
      console.log(`  ✅ Should use Responses API: ${shouldUseResponses}`)

      console.log('\nStep 3: Building unified request parameters...')
      const unifiedParams = {
        messages: [{ role: 'user', content: 'What is 2+2?' }],
        systemPrompt: ['You are a helpful assistant.'],
        tools: [],
        maxTokens: 100,
        stream: true,
        reasoningEffort: shouldUseResponses ? ('high' as const) : undefined,
        temperature: 1,
        verbosity: shouldUseResponses ? ('high' as const) : undefined,
      }
      console.log('  ✅ Unified params built')

      console.log('\nStep 4: Creating request via adapter...')
      const request = adapter.createRequest(unifiedParams)
      console.log('  ✅ Request created')
      console.log('\n📝 REQUEST STRUCTURE:')
      console.log(JSON.stringify(request, null, 2))

      console.log('\nStep 5: Making API call...')
      const endpoint = shouldUseResponses
        ? `${ACTIVE_PROFILE.baseURL}/responses`
        : `${ACTIVE_PROFILE.baseURL}/chat/completions`
      console.log(`  📍 Endpoint: ${endpoint}`)
      console.log(`  🔑 API Key: ${ACTIVE_PROFILE.apiKey.substring(0, 8)}...`)

      let response: any
      if (shouldUseResponses) {
        response = await callGPT5ResponsesAPI(ACTIVE_PROFILE, request)
      } else {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${ACTIVE_PROFILE.apiKey}`,
          },
          body: JSON.stringify(request),
        })
      }
      console.log(`  ✅ Response received: ${response.status}`)

      if (!shouldUseResponses && response.headers) {
        if (!request.stream) {
          const responseData = await response.json()
          console.log('\n🔍 Raw Chat Completions Response:')
          console.log(JSON.stringify(responseData, null, 2))
          response = responseData
        } else {
          console.log(
            '\n🔍 Streaming Chat Completions Response (skipping JSON parse)',
          )
        }
      }

      console.log('\nStep 6: Parsing response...')
      const unifiedResponse = await adapter.parseResponse(response)
      console.log('  ✅ Response parsed')
      console.log('\n📄 UNIFIED RESPONSE:')
      console.log(JSON.stringify(unifiedResponse, null, 2))

      console.log('\nStep 7: Validating response...')
      expect(unifiedResponse).toBeDefined()
      expect(unifiedResponse.content).toBeDefined()
      expectUnifiedUsage(unifiedResponse.usage)
      console.log('  ✅ All validations passed')
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      console.log('\n❌ ERROR CAUGHT:')
      console.log(`  Message: ${err.message}`)
      console.log(`  Stack: ${err.stack}`)
      throw err
    }
  })
})
