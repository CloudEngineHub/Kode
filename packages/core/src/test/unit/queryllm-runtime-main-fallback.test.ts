import { describe, expect, test, beforeEach } from 'bun:test'

import { queryLLM, PROMPT_TOO_LONG_ERROR_MESSAGE } from '#core/ai/llm'
import {
  clearNotifications,
  getNotifications,
} from '#core/services/notificationCenter'
import type { ModelParam, ResolvedModelInfo } from '#core/utils/model'
import type { ModelProfile } from '#core/utils/config'
import { createAssistantMessage, createUserMessage } from '#core/utils/messages'

function modelProfile(
  name: string,
  overrides: Partial<ModelProfile> = {},
): ModelProfile {
  return {
    modelName: `${name}-model`,
    provider: 'custom-openai',
    name,
    apiKey: `${name}-key`,
    maxTokens: 1,
    contextLength: 1,
    createdAt: 0,
    isActive: true,
    ...overrides,
  }
}

function createFakeModelManager(profiles: Record<string, ModelProfile>) {
  return {
    resolveModelWithInfo(modelParam: ModelParam): ResolvedModelInfo {
      const profile = profiles[String(modelParam)]
      if (!profile) {
        return {
          success: false,
          profile: null,
          error: `missing ${String(modelParam)}`,
        }
      }
      return { success: true, profile }
    },
    resolveModel(modelParam: ModelParam): ModelProfile | null {
      return profiles[String(modelParam)] ?? null
    },
  }
}

describe('queryLLM runtime fallback to main profile', () => {
  beforeEach(() => {
    clearNotifications()
  })

  test('routes auxiliary task requests to main profile after API failure', async () => {
    const taskProfile = modelProfile('task')
    const mainProfile = modelProfile('main')
    const fakeModelManager = createFakeModelManager({
      task: taskProfile,
      main: mainProfile,
    })

    const calls: Array<{ model: string; apiKey: string }> = []

    async function stubQueryLLMWithPromptCaching(
      _messages: any,
      _systemPrompt: any,
      _maxThinkingTokens: any,
      _tools: any,
      _signal: any,
      options: any,
    ): Promise<any> {
      calls.push({
        model: options.model,
        apiKey: options.modelProfile.apiKey,
      })
      if (calls.length === 1) {
        const error = new Error('fetch failed: ECONNRESET') as Error & {
          status?: number
        }
        error.status = 503
        throw error
      }
      return createAssistantMessage('ok from main')
    }

    const message = await queryLLM(
      [createUserMessage('hi')],
      ['system'],
      0,
      [],
      new AbortController().signal,
      {
        safeMode: false,
        model: 'task',
        prependCLISysprompt: false,
        __testModelManager: fakeModelManager,
        __testQueryLLMWithPromptCaching: stubQueryLLMWithPromptCaching,
      },
    )

    expect(message.message.content).toEqual([
      { type: 'text', text: 'ok from main', citations: [] },
    ])
    expect(calls).toEqual([
      { model: 'task-model', apiKey: 'task-key' },
      { model: 'main-model', apiKey: 'main-key' },
    ])
    expect(
      getNotifications().some(
        notification =>
          notification.kind === 'warning' &&
          notification.message.includes('routing this request to main profile'),
      ),
    ).toBe(true)
  })

  test('routes explicit subagent model requests to main profile after API failure', async () => {
    const subagentProfile = modelProfile('subagent')
    const mainProfile = modelProfile('main')
    const fakeModelManager = createFakeModelManager({
      subagent: subagentProfile,
      main: mainProfile,
    })
    const calls: Array<{ model: string; apiKey: string }> = []

    async function stubQueryLLMWithPromptCaching(
      _messages: any,
      _systemPrompt: any,
      _maxThinkingTokens: any,
      _tools: any,
      _signal: any,
      options: any,
    ): Promise<any> {
      calls.push({
        model: options.model,
        apiKey: options.modelProfile.apiKey,
      })
      if (calls.length === 1) {
        throw new Error('API Error: model not available')
      }
      return createAssistantMessage('ok from main')
    }

    await queryLLM(
      [createUserMessage('hi')],
      ['system'],
      0,
      [],
      new AbortController().signal,
      {
        safeMode: false,
        model: 'subagent',
        prependCLISysprompt: false,
        toolUseContext: {
          agentId: 'subagent-1',
          messageId: 'message-1',
        } as any,
        __testModelManager: fakeModelManager,
        __testQueryLLMWithPromptCaching: stubQueryLLMWithPromptCaching,
      },
    )

    expect(calls).toEqual([
      { model: 'subagent-model', apiKey: 'subagent-key' },
      { model: 'main-model', apiKey: 'main-key' },
    ])
  })

  test('does not fallback when the main request fails', async () => {
    const mainProfile = modelProfile('main')
    const fakeModelManager = createFakeModelManager({ main: mainProfile })
    const calls: string[] = []

    async function stubQueryLLMWithPromptCaching(
      _messages: any,
      _systemPrompt: any,
      _maxThinkingTokens: any,
      _tools: any,
      _signal: any,
      options: any,
    ): Promise<any> {
      calls.push(options.model)
      throw new Error('fetch failed')
    }

    await expect(
      queryLLM(
        [createUserMessage('hi')],
        ['system'],
        0,
        [],
        new AbortController().signal,
        {
          safeMode: false,
          model: 'main',
          prependCLISysprompt: false,
          __testModelManager: fakeModelManager,
          __testQueryLLMWithPromptCaching: stubQueryLLMWithPromptCaching,
        },
      ),
    ).rejects.toThrow('fetch failed')

    expect(calls).toEqual(['main-model'])
    expect(getNotifications()).toHaveLength(0)
  })

  test('does not fallback on user abort', async () => {
    const taskProfile = modelProfile('task')
    const mainProfile = modelProfile('main')
    const fakeModelManager = createFakeModelManager({
      task: taskProfile,
      main: mainProfile,
    })
    const controller = new AbortController()
    controller.abort()
    const calls: string[] = []

    async function stubQueryLLMWithPromptCaching(
      _messages: any,
      _systemPrompt: any,
      _maxThinkingTokens: any,
      _tools: any,
      _signal: any,
      options: any,
    ): Promise<any> {
      calls.push(options.model)
      throw new DOMException('operation was aborted', 'AbortError')
    }

    await expect(
      queryLLM(
        [createUserMessage('hi')],
        ['system'],
        0,
        [],
        controller.signal,
        {
          safeMode: false,
          model: 'task',
          prependCLISysprompt: false,
          __testModelManager: fakeModelManager,
          __testQueryLLMWithPromptCaching: stubQueryLLMWithPromptCaching,
        },
      ),
    ).rejects.toThrow('operation was aborted')

    expect(calls).toEqual(['task-model'])
    expect(getNotifications()).toHaveLength(0)
  })

  test('does not fallback on prompt size errors', async () => {
    const taskProfile = modelProfile('task')
    const mainProfile = modelProfile('main')
    const fakeModelManager = createFakeModelManager({
      task: taskProfile,
      main: mainProfile,
    })
    const calls: string[] = []

    async function stubQueryLLMWithPromptCaching(
      _messages: any,
      _systemPrompt: any,
      _maxThinkingTokens: any,
      _tools: any,
      _signal: any,
      options: any,
    ): Promise<any> {
      calls.push(options.model)
      throw new Error(PROMPT_TOO_LONG_ERROR_MESSAGE)
    }

    await expect(
      queryLLM(
        [createUserMessage('hi')],
        ['system'],
        0,
        [],
        new AbortController().signal,
        {
          safeMode: false,
          model: 'task',
          prependCLISysprompt: false,
          __testModelManager: fakeModelManager,
          __testQueryLLMWithPromptCaching: stubQueryLLMWithPromptCaching,
        },
      ),
    ).rejects.toThrow(PROMPT_TOO_LONG_ERROR_MESSAGE)

    expect(calls).toEqual(['task-model'])
    expect(getNotifications()).toHaveLength(0)
  })
})
