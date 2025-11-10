/**
 * Integration Test: Full Claude.ts Flow (Model-Agnostic)
 *
 * This test exercises the EXACT same code path the CLI uses:
 * claude.ts → ModelAdapterFactory → adapter → API
 *
 * Switch between models using TEST_MODEL env var:
 * - TEST_MODEL=gpt5 (default) - uses GPT-5 with Responses API
 * - TEST_MODEL=minimax - uses MiniMax with Chat Completions API
 *
 * API-SPECIFIC tests have been moved to:
 * - responses-api-e2e.test.ts (for Responses API)
 * - chat-completions-e2e.test.ts (for Chat Completions API)
 *
 * This file contains only model-agnostic integration tests
 */

import { test, expect, describe } from 'bun:test'
import { ModelAdapterFactory } from '../services/modelAdapterFactory'
import { ModelProfile } from '../utils/config'
import { callGPT5ResponsesAPI } from '../services/openai'

// Load environment variables from .env file for integration tests
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

// Test profiles for different models
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

const MINIMAX_CODEX_PROFILE: ModelProfile = {
  name: 'minimax codex-MiniMax-M2',
  provider: 'minimax',
  modelName: 'codex-MiniMax-M2',
  baseURL: process.env.TEST_MINIMAX_BASE_URL || 'https://api.minimaxi.com/v1',
  apiKey: process.env.TEST_MINIMAX_API_KEY || '',
  maxTokens: 8192,
  contextLength: 128000,
  reasoningEffort: null,
  createdAt: Date.now(),
  isActive: true,
}

// Switch between models using TEST_MODEL env var
// Options: 'gpt5' (default) or 'minimax'
const TEST_MODEL = process.env.TEST_MODEL || 'gpt5'
const ACTIVE_PROFILE = TEST_MODEL === 'minimax' ? MINIMAX_CODEX_PROFILE : GPT5_CODEX_PROFILE

describe('🔌 Integration: Full Claude.ts Flow (Model-Agnostic)', () => {
  test('✅ End-to-end flow through claude.ts path', async () => {
    console.log('\n🔧 TEST CONFIGURATION:')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`  🧪 Test Model: ${TEST_MODEL}`)
    console.log(`  📝 Model Name: ${ACTIVE_PROFILE.modelName}`)
    console.log(`  🏢 Provider: ${ACTIVE_PROFILE.provider}`)
    console.log(`  🔗 Adapter: ${ModelAdapterFactory.createAdapter(ACTIVE_PROFILE).constructor.name}`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('\n🔌 INTEGRATION TEST: Full Flow')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    try {
      // Step 1: Create adapter (same as claude.ts:1936)
      console.log('Step 1: Creating adapter...')
      const adapter = ModelAdapterFactory.createAdapter(ACTIVE_PROFILE)
      console.log(`  ✅ Adapter: ${adapter.constructor.name}`)

      // Step 2: Check if should use Responses API (same as claude.ts:1955)
      console.log('\nStep 2: Checking if should use Responses API...')
      const shouldUseResponses = ModelAdapterFactory.shouldUseResponsesAPI(ACTIVE_PROFILE)
      console.log(`  ✅ Should use Responses API: ${shouldUseResponses}`)

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
        reasoningEffort: shouldUseResponses ? 'high' as const : undefined,
        temperature: 1,
        verbosity: shouldUseResponses ? 'high' as const : undefined
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
            'Authorization': `Bearer ${ACTIVE_PROFILE.apiKey}`,
          },
          body: JSON.stringify(request),
        })
      }
      console.log(`  ✅ Response received: ${response.status}`)

      // For Chat Completions, show raw response when content is empty
      if (!shouldUseResponses && response.headers) {
        const responseData = await response.json()
        console.log('\n🔍 Raw MiniMax Response:')
        console.log(JSON.stringify(responseData, null, 2))
        response = responseData
      }

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
      const adapter = ModelAdapterFactory.createAdapter(ACTIVE_PROFILE)
      const shouldUseResponses = ModelAdapterFactory.shouldUseResponsesAPI(ACTIVE_PROFILE)

      if (!shouldUseResponses) {
        console.log('  ⚠️  SKIPPING: Not using Responses API (tools only tested for Responses API)')
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
