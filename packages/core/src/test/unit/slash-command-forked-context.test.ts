import { describe, expect, test } from 'bun:test'

import type { ToolUseContext } from '#core/tooling/Tool'
import { createAssistantMessage } from '#core/utils/messages'
import { SlashCommandTool } from '#tools/tools/interaction/SlashCommandTool/SlashCommandTool'

function makeContext(overrides?: Partial<ToolUseContext>): ToolUseContext {
  const base: ToolUseContext = {
    abortController: new AbortController(),
    messageId: 'test',
    toolUseId: 'tool_use_test',
    options: {
      commands: [],
      tools: [],
      verbose: false,
      safeMode: false,
      forkNumber: 0,
      messageLogName: 'test',
      maxThinkingTokens: 0,
      model: 'main',
    },
    readFileTimestamps: {},
  }
  return {
    ...base,
    ...overrides,
    options: {
      ...base.options,
      ...(overrides?.options ?? {}),
    },
  }
}

describe('SlashCommandTool forked execution (context: fork)', () => {
  test('executes via TaskTool and returns status=forked', async () => {
    let capturedTaskToolUseContext: any = null

    const __testQuery = async function* (
      _messages: any[],
      _systemPrompt: string[],
      _ctx: Record<string, string>,
      _canUseTool: any,
      toolUseContext: any,
    ) {
      capturedTaskToolUseContext = toolUseContext
      yield createAssistantMessage('subagent says hi')
    }

    const cmd = {
      type: 'prompt',
      name: 'fork-cmd',
      context: 'fork',
      agent: 'general-purpose',
      disableModelInvocation: false,
      disableNonInteractive: false,
      allowedTools: ['Read(~/**)'],
      userFacingName() {
        return 'fork-cmd'
      },
      async getPromptForCommand() {
        return [{ role: 'user', content: 'do thing' }]
      },
    }

    const ctx = makeContext({ options: { commands: [cmd] } }) as any
    ctx.__testQuery = __testQuery

    const gen = SlashCommandTool.call({ command: '/fork-cmd arg' }, ctx)

    let final: any = null
    for await (const evt of gen as any) {
      if (evt.type === 'result') final = evt.data
    }

    expect(final).toBeTruthy()
    expect(final.status).toBe('forked')
    expect(typeof final.agentId).toBe('string')
    expect(final.result).toContain('subagent says hi')

    expect(capturedTaskToolUseContext).toBeTruthy()
    expect(capturedTaskToolUseContext.options?.commandAllowedTools).toContain(
      'Read(~/**)',
    )
  })
})
