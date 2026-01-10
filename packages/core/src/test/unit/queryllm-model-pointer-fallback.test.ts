import { describe, expect, test } from 'bun:test'
import { queryLLM } from '#core/ai/llm'
import { createAssistantMessage, createUserMessage } from '#core/utils/messages'

describe('queryLLM model pointer fallback (compatibility)', () => {
  test('falls back when resolveModelWithInfo fails (no throw)', async () => {
    const fallbackModelName = 'fallback-model'

    const fakeModelManager = {
      resolveModelWithInfo() {
        return {
          success: false,
          profile: null,
          error:
            "Model pointer 'quick' points to invalid model 'bad-model'. Use /model to reconfigure.",
        }
      },
      resolveModel() {
        return {
          modelName: fallbackModelName,
          provider: 'openai',
          name: 'Fallback',
          isActive: true,
        }
      },
    }

    let resolvedModelParam: string | undefined

    async function stubQueryLLMWithPromptCaching(
      _messages: any,
      _systemPrompt: any,
      _maxThinkingTokens: any,
      _tools: any,
      _signal: any,
      options: any,
    ) {
      resolvedModelParam = options.model
      const base = createAssistantMessage('ok')
      return {
        ...base,
        message: { ...base.message, model: String(options.model ?? '') },
      }
    }

    const message = await queryLLM(
      [createUserMessage('hi')],
      ['system'],
      0,
      [],
      new AbortController().signal,
      {
        safeMode: false,
        model: 'quick',
        prependCLISysprompt: false,
        __testModelManager: fakeModelManager,
        __testQueryLLMWithPromptCaching: stubQueryLLMWithPromptCaching,
      },
    )

    expect(resolvedModelParam).toBe(fallbackModelName)
    expect(message.message.model).toBe(fallbackModelName)
  })
})
