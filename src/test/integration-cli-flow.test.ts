/**
 * Integration Test: Full Claude.ts Flow
 *
 * This test exercises the EXACT same code path the CLI uses:
 * claude.ts → ModelAdapterFactory → adapter → API
 *
 * Fast iteration for debugging without running full CLI
 */

import { test, expect, describe } from 'bun:test'
import { ModelAdapterFactory } from '../services/modelAdapterFactory'
import { getModelCapabilities } from '../constants/modelCapabilities'
import { ModelProfile } from '../utils/config'
import { callGPT5ResponsesAPI } from '../services/openai'

// Test profile matching what the CLI would use
const GPT5_CODEX_PROFILE: ModelProfile = {
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

describe('🔌 Integration: Full Claude.ts Flow', () => {
  test('✅ End-to-end flow through claude.ts path', async () => {
    console.log('\n🔌 INTEGRATION TEST: Full Flow')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    try {
      // Step 1: Create adapter (same as claude.ts:1936)
      console.log('Step 1: Creating adapter...')
      const adapter = ModelAdapterFactory.createAdapter(GPT5_CODEX_PROFILE)
      console.log(`  ✅ Adapter: ${adapter.constructor.name}`)

      // Step 2: Check if should use Responses API (same as claude.ts:1955)
      console.log('\nStep 2: Checking if should use Responses API...')
      const shouldUseResponses = ModelAdapterFactory.shouldUseResponsesAPI(GPT5_CODEX_PROFILE)
      console.log(`  ✅ Should use Responses API: ${shouldUseResponses}`)

      if (!shouldUseResponses) {
        console.log('  ⚠️  SKIPPING: Not using Responses API')
        return
      }

      // Step 3: Build unified params (same as claude.ts:1939-1949)
      console.log('\nStep 3: Building unified request parameters...')
      const unifiedParams = {
        messages: [
          { role: 'user', content: 'What is 2+2?' }
        ],
        systemPrompt: ['You are a helpful assistant.'],
        tools: [],  // Start with no tools to isolate the issue
        maxTokens: 100,
        stream: false,
        reasoningEffort: 'high' as const,
        temperature: 1,
        verbosity: 'high' as const
      }
      console.log('  ✅ Unified params built')

      // Step 4: Create request (same as claude.ts:1952)
      console.log('\nStep 4: Creating request via adapter...')
      const request = adapter.createRequest(unifiedParams)
      console.log('  ✅ Request created')
      console.log('\n📝 REQUEST STRUCTURE:')
      console.log(JSON.stringify(request, null, 2))

      // Step 5: Make API call (same as claude.ts:1958)
      console.log('\nStep 5: Making API call...')
      console.log(`  📍 Endpoint: ${GPT5_CODEX_PROFILE.baseURL}/responses`)
      console.log(`  🔑 API Key: ${GPT5_CODEX_PROFILE.apiKey.substring(0, 8)}...`)

      const response = await callGPT5ResponsesAPI(GPT5_CODEX_PROFILE, request)
      console.log(`  ✅ Response received: ${response.status}`)

      // Step 6: Parse response (same as claude.ts:1959)
      console.log('\nStep 6: Parsing response...')
      const unifiedResponse = await adapter.parseResponse(response)
      console.log('  ✅ Response parsed')
      console.log('\n📄 UNIFIED RESPONSE:')
      console.log(JSON.stringify(unifiedResponse, null, 2))

      // Step 7: Check for errors
      console.log('\nStep 7: Validating response...')
      expect(unifiedResponse).toBeDefined()
      expect(unifiedResponse.content).toBeDefined()
      console.log('  ✅ All validations passed')

    } catch (error) {
      console.log('\n❌ ERROR CAUGHT:')
      console.log(`  Message: ${error.message}`)
      console.log(`  Stack: ${error.stack}`)

      // Re-throw to fail the test
      throw error
    }
  })

  test('⚠️  Test with TOOLS (reproduces the 400 error)', async () => {
    console.log('\n⚠️  INTEGRATION TEST: With Tools (Should Fail)')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    try {
      const adapter = ModelAdapterFactory.createAdapter(GPT5_CODEX_PROFILE)
      const shouldUseResponses = ModelAdapterFactory.shouldUseResponsesAPI(GPT5_CODEX_PROFILE)

      if (!shouldUseResponses) {
        console.log('  ⚠️  SKIPPING: Not using Responses API')
        return
      }

      // Build params WITH tools (this might cause the 400 error)
      const unifiedParams = {
        messages: [
          { role: 'user', content: 'What is 2+2?' }
        ],
        systemPrompt: ['You are a helpful assistant.'],
        tools: [
          {
            name: 'read_file',
            description: 'Read file contents',
            inputSchema: {
              type: 'object',
              properties: {
                path: { type: 'string' }
              }
            }
          }
        ],
        maxTokens: 100,
        stream: false,
        reasoningEffort: 'high' as const,
        temperature: 1,
        verbosity: 'high' as const
      }

      const request = adapter.createRequest(unifiedParams)

      console.log('\n📝 REQUEST WITH TOOLS:')
      console.log(JSON.stringify(request, null, 2))
      console.log('\n🔍 TOOLS STRUCTURE:')
      if (request.tools) {
        request.tools.forEach((tool: any, i: number) => {
          console.log(`  Tool ${i}:`, JSON.stringify(tool, null, 2))
        })
      }

      const response = await callGPT5ResponsesAPI(GPT5_CODEX_PROFILE, request)
      const unifiedResponse = await adapter.parseResponse(response)

      console.log('\n✅ SUCCESS: Request with tools worked!')
      console.log('Response:', JSON.stringify(unifiedResponse, null, 2))

      expect(unifiedResponse).toBeDefined()

    } catch (error) {
      console.log('\n❌ EXPECTED ERROR (This is the bug we\'re tracking):')
      console.log(`  Status: ${error.message}`)

      if (error.message.includes('400')) {
        console.log('\n🔍 THIS IS THE BUG!')
        console.log('  The 400 error happens with tools')
        console.log('  Check the request structure above')
      }

      throw error
    }
  })
})
