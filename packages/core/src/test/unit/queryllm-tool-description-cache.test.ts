import { describe, expect, test } from 'bun:test'

import { queryLLM } from '#core/ai/llm'
import { createAssistantMessage, createUserMessage } from '#core/utils/messages'
import type { Tool } from '#core/tooling/Tool'
import { z } from 'zod'

describe('queryLLM tool description pre-resolution', () => {
  test('populates cachedDescription for async description tools before calling provider', async () => {
    const inputSchema = z.object({})

    const tool: Tool<typeof inputSchema, { ok: boolean }> = {
      name: 'AsyncDescTool',
      description: async () => 'async description',
      inputSchema,
      prompt: async () => 'prompt',
      isEnabled: async () => true,
      isReadOnly: () => true,
      isConcurrencySafe: () => true,
      needsPermissions: () => false,
      renderResultForAssistant: () => 'ok',
      renderToolUseMessage: () => 'use',
      call: async function* () {
        yield { type: 'result' as const, data: { ok: true } }
      },
    }

    const fakeModelManager = {
      resolveModelWithInfo() {
        return {
          success: true,
          profile: {
            modelName: 'test-model',
            provider: 'openai',
            name: 'Test',
            apiKey: 'test',
            maxTokens: 1,
            contextLength: 1,
            isActive: true,
          },
        }
      },
      resolveModel() {
        return null
      },
    }

    let sawCachedDescription: string | undefined

    async function stubQueryLLMWithPromptCaching(
      _messages: any,
      _systemPrompt: any,
      _maxThinkingTokens: any,
      passedTools: any,
      _signal: any,
      _options: any,
    ) {
      sawCachedDescription = passedTools?.[0]?.cachedDescription
      return createAssistantMessage('ok')
    }

    await queryLLM(
      [createUserMessage('hi')],
      ['system'],
      0,
      [tool],
      new AbortController().signal,
      {
        safeMode: false,
        model: 'main',
        prependCLISysprompt: false,
        __testModelManager: fakeModelManager,
        __testQueryLLMWithPromptCaching: stubQueryLLMWithPromptCaching,
      },
    )

    expect(tool.cachedDescription).toBe('async description')
    expect(sawCachedDescription).toBe('async description')
  })
})
