import { describe, expect, test } from 'bun:test'
import { ModelAdapterFactory } from '#core/ai/modelAdapterFactory'
import { callGPT5ResponsesAPI } from '#core/ai/openai'
import {
  ACTIVE_PRODUCTION_MODELS,
  expectUnifiedUsage,
  getActiveProfile,
} from './integration-cli-flow.shared'

describe('🔌 Integration: Full CLI Flow (Regression)', () => {
  if (ACTIVE_PRODUCTION_MODELS.length === 0) {
    test.skip('✅ Regression tests (requires API keys)', () => {})
    return
  }

  test(
    '✅ Bug Regression: Empty content should never occur',
    async () => {
      const ACTIVE_PROFILE = getActiveProfile()
      const adapter = ModelAdapterFactory.createAdapter(ACTIVE_PROFILE)
      const shouldUseResponses =
        ModelAdapterFactory.shouldUseResponsesAPI(ACTIVE_PROFILE)

      const request = adapter.createRequest({
        messages: [{ role: 'user', content: 'What is 2+2?' }],
        systemPrompt: ['You are a helpful assistant.'],
        tools: [],
        maxTokens: 50,
        stream: true,
        reasoningEffort: shouldUseResponses ? ('medium' as const) : undefined,
        temperature: 1,
        verbosity: shouldUseResponses ? ('medium' as const) : undefined,
      })

      const endpoint = shouldUseResponses
        ? `${ACTIVE_PROFILE.baseURL}/responses`
        : `${ACTIVE_PROFILE.baseURL}/chat/completions`

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

      const unifiedResponse = await adapter.parseResponse(response)
      expectUnifiedUsage(unifiedResponse.usage)

      const content = Array.isArray(unifiedResponse.content)
        ? unifiedResponse.content.map(b => b.text || b.content || '').join('')
        : unifiedResponse.content || ''

      expect(content.length).toBeGreaterThan(0)
      expect(content).not.toBe('')
      expect(content).not.toBe('(no content)')
    },
    { timeout: 15000 },
  )

  test(
    '✅ responseId preservation across adapter chain',
    async () => {
      const ACTIVE_PROFILE = getActiveProfile()
      const adapter = ModelAdapterFactory.createAdapter(ACTIVE_PROFILE)
      const shouldUseResponses =
        ModelAdapterFactory.shouldUseResponsesAPI(ACTIVE_PROFILE)

      const request = adapter.createRequest({
        messages: [{ role: 'user', content: 'Hello' }],
        systemPrompt: ['You are a helpful assistant.'],
        tools: [],
        maxTokens: 50,
        stream: true,
        reasoningEffort: shouldUseResponses ? ('medium' as const) : undefined,
        temperature: 1,
        verbosity: shouldUseResponses ? ('medium' as const) : undefined,
      })

      const endpoint = shouldUseResponses
        ? `${ACTIVE_PROFILE.baseURL}/responses`
        : `${ACTIVE_PROFILE.baseURL}/chat/completions`

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

      const unifiedResponse = await adapter.parseResponse(response)
      expectUnifiedUsage(unifiedResponse.usage)

      expect(unifiedResponse.id).toBeDefined()
      expect(unifiedResponse.responseId).toBeDefined()
      expect(unifiedResponse.responseId).not.toBeNull()
      expect(unifiedResponse.responseId).not.toBe('')
    },
    { timeout: 15000 },
  )
})
