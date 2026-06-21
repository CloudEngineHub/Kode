import { describe, expect, test } from 'bun:test'

import type { ToolUseContext } from '#core/tooling/Tool'
import { createAssistantMessage } from '#core/utils/messages'
import { SkillTool } from '#tools/tools/interaction/SkillTool/SkillTool'

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

describe('SkillTool forked execution (context: fork)', () => {
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
      name: 'fork-skill',
      context: 'fork',
      agent: 'general-purpose',
      disableModelInvocation: false,
      allowedTools: ['Read(~/**)'],
      userFacingName() {
        return 'fork-skill'
      },
      async getPromptForCommand() {
        return [{ role: 'user', content: 'do thing' }]
      },
    }

    const ctx = makeContext({ options: { commands: [cmd] } }) as any
    ctx.__testQuery = __testQuery

    const gen = SkillTool.call({ skill: 'fork-skill' }, ctx)

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
