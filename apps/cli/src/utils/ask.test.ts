import { describe, expect, test } from 'bun:test'

import { ask } from './ask'

describe('ask(): system prompt flags', () => {
  test('passes systemPromptOverride + appendSystemPrompt to buildSystemPromptForSession()', async () => {
    let captured: any = null

    const out = await ask(
      {
        commands: [] as any,
        tools: [] as any,
        hasPermissionsToUseTool: (() => ({ result: true })) as any,
        messageLogName: 'test',
        prompt: 'hi',
        cwd: '/tmp',
        systemPromptOverride: 'OVERRIDE',
        appendSystemPrompt: 'APPEND',
      },
      {
        setCwd: async () => {},
        getCurrentOutputStyleDefinition: () => null,
        buildSystemPromptForSession: async args => {
          captured = args
          return ['DEFAULT']
        },
        getContext: async () => ({}),
        getMaxThinkingTokens: async () => 0,
        query: async function* () {
          yield {
            type: 'assistant',
            uuid: 'assistant-uuid',
            message: { content: [{ type: 'text', text: 'ok' }] },
          } as any
        },
        createUserMessage: (prompt: string) =>
          ({
            type: 'user',
            uuid: 'user-uuid',
            message: { content: [{ type: 'text', text: prompt }] },
          }) as any,
        getMessagesPath: () => 'messages.json',
        overwriteLog: () => {},
        getTotalCost: () => 0,
      },
    )

    expect(captured?.systemPromptOverride).toBe('OVERRIDE')
    expect(captured?.appendSystemPrompt).toBe('APPEND')
    expect(out.resultText).toBe('ok')
    expect(out.messageHistoryFile).toBe('messages.json')
  })

  test('passes appendSystemPrompt even when systemPromptOverride is empty', async () => {
    let captured: any = null

    await ask(
      {
        commands: [] as any,
        tools: [] as any,
        hasPermissionsToUseTool: (() => ({ result: true })) as any,
        messageLogName: 'test',
        prompt: 'hi',
        cwd: '/tmp',
        systemPromptOverride: '',
        appendSystemPrompt: 'APPEND',
      },
      {
        setCwd: async () => {},
        getCurrentOutputStyleDefinition: () => null,
        buildSystemPromptForSession: async args => {
          captured = args
          return ['DEFAULT']
        },
        getContext: async () => ({}),
        getMaxThinkingTokens: async () => 0,
        query: async function* () {
          yield {
            type: 'assistant',
            uuid: 'assistant-uuid',
            message: { content: [{ type: 'text', text: 'ok' }] },
          } as any
        },
        createUserMessage: (prompt: string) =>
          ({
            type: 'user',
            uuid: 'user-uuid',
            message: { content: [{ type: 'text', text: prompt }] },
          }) as any,
        getMessagesPath: () => 'messages.json',
        overwriteLog: () => {},
        getTotalCost: () => 0,
      },
    )

    expect(captured?.systemPromptOverride).toBe('')
    expect(captured?.appendSystemPrompt).toBe('APPEND')
  })
})
