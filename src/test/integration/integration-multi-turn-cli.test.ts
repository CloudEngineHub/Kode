import { test, expect, describe } from 'bun:test'
import { queryLLM } from '../../services/claude'
import { getModelManager } from '../../utils/model'
import { UserMessage, AssistantMessage } from '../../services/claude'
import { getGlobalConfig } from '../../utils/config'
import { ModelAdapterFactory } from '../../services/modelAdapterFactory'

const GPT5_CODEX_PROFILE = {
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

const MINIMAX_CODEX_PROFILE = {
  name: 'MiniMax',
  provider: 'minimax',
  modelName: 'MiniMax-M2',
  baseURL: process.env.TEST_CHAT_COMPLETIONS_BASE_URL || 'https://api.minimax.chat/v1',
  apiKey: process.env.TEST_CHAT_COMPLETIONS_API_KEY || '',
  maxTokens: 8192,
  contextLength: 128000,
  reasoningEffort: 'medium',
  isActive: true,
  createdAt: Date.now(),
}

describe('Integration: Multi-Turn CLI Flow', () => {
  test('[Responses API] Bug Detection: Empty content should NOT occur', async () => {
    console.log('\n🔍 BUG DETECTION TEST: Empty Content Check')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    const abortController = new AbortController()

    // This is the exact scenario that failed before the fix
    // Use direct adapter call to avoid model manager complexity
    const adapter = ModelAdapterFactory.createAdapter(GPT5_CODEX_PROFILE)
    const shouldUseResponses = ModelAdapterFactory.shouldUseResponsesAPI(GPT5_CODEX_PROFILE)

    if (!shouldUseResponses) {
      console.log('  ⚠️  Skipping: Model does not support Responses API')
      return
    }

    const request = adapter.createRequest({
      messages: [{ role: 'user', content: 'What is 2+2?' }],
      systemPrompt: ['You are a helpful assistant.'],
      tools: [],
      maxTokens: 50,
      reasoningEffort: 'medium' as const,
      temperature: 1,
      verbosity: 'medium' as const
    })

    const { callGPT5ResponsesAPI } = await import('../../services/openai')
    const response = await callGPT5ResponsesAPI(GPT5_CODEX_PROFILE, request)
    const unifiedResponse = await adapter.parseResponse(response)

    console.log(`  📄 Content: "${JSON.stringify(unifiedResponse.content)}"`)

    // THIS IS THE BUG: Content would be empty before the fix
    const content = Array.isArray(unifiedResponse.content)
      ? unifiedResponse.content.map(b => b.text || b.content).join('')
      : unifiedResponse.content

    console.log(`\n  Content length: ${content.length} chars`)
    console.log(`  Content text: "${content}"`)

    // CRITICAL ASSERTION: Content MUST NOT be empty
    expect(content.length).toBeGreaterThan(0)
    expect(content).not.toBe('')
    expect(content).not.toBe('(no content)')

    if (content.length > 0) {
      console.log(`\n  ✅ BUG FIXED: Content is present (${content.length} chars)`)
    } else {
      console.log(`\n  ❌ BUG PRESENT: Content is empty!`)
    }
  })

  test('[Responses API] responseId is returned from adapter', async () => {
    console.log('\n🔄 INTEGRATION TEST: responseId in Return Value')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    const adapter = ModelAdapterFactory.createAdapter(GPT5_CODEX_PROFILE)
    const shouldUseResponses = ModelAdapterFactory.shouldUseResponsesAPI(GPT5_CODEX_PROFILE)

    if (!shouldUseResponses) {
      console.log('  ⚠️  Skipping: Model does not support Responses API')
      return
    }

    const request = adapter.createRequest({
      messages: [{ role: 'user', content: 'Hello' }],
      systemPrompt: ['You are a helpful assistant.'],
      tools: [],
      maxTokens: 50,
      reasoningEffort: 'medium' as const,
      temperature: 1,
      verbosity: 'medium' as const
    })

    const { callGPT5ResponsesAPI } = await import('../../services/openai')
    const response = await callGPT5ResponsesAPI(GPT5_CODEX_PROFILE, request)
    const unifiedResponse = await adapter.parseResponse(response)

    // Convert to AssistantMessage (like refactored claude.ts)
    const assistantMsg = {
      type: 'assistant' as const,
      message: {
        role: 'assistant' as const,
        content: unifiedResponse.content,
        tool_calls: unifiedResponse.toolCalls,
        usage: {
          prompt_tokens: unifiedResponse.usage.promptTokens,
          completion_tokens: unifiedResponse.usage.completionTokens,
        }
      },
      costUSD: 0,
      durationMs: 0,
      uuid: 'test',
      responseId: unifiedResponse.responseId
    }

    console.log(`  📄 AssistantMessage has responseId: ${!!assistantMsg.responseId}`)
    console.log(`  🆔 responseId: ${assistantMsg.responseId}`)

    // CRITICAL ASSERTION: responseId must be present
    expect(assistantMsg.responseId).toBeDefined()
    expect(assistantMsg.responseId).not.toBeNull()

    console.log('\n  ✅ responseId correctly preserved in AssistantMessage')
  })
})
