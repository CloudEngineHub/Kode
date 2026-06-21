import { describe, expect, test } from 'bun:test'
import { createAssistantMessage, createUserMessage } from '#core/utils/messages'
import {
  kodeMessageToSdkMessage,
  makeSdkInitMessage,
  makeSdkResultMessage,
} from '#protocol/utils/kodeAgentStreamJson'

describe('stream-json helpers', () => {
  test('init message includes session_id/cwd/tools', () => {
    const msg = makeSdkInitMessage({
      sessionId: '00000000-0000-0000-0000-000000000000',
      cwd: '/tmp/project',
      tools: ['Bash', 'Read'],
    })
    expect(msg.type).toBe('system')
    if (msg.type !== 'system') throw new Error('Expected system message')
    expect(msg.subtype).toBe('init')
    expect(msg.session_id).toBe('00000000-0000-0000-0000-000000000000')
    expect(msg.cwd).toBe('/tmp/project')
    expect(msg.tools).toEqual(['Bash', 'Read'])
    expect(msg.slash_commands).toBeUndefined()
  })

  test('init message includes slash_commands only when provided', () => {
    const withSlash = makeSdkInitMessage({
      sessionId: '00000000-0000-0000-0000-000000000000',
      cwd: '/tmp/project',
      tools: ['Bash'],
      slashCommands: ['/help', '/compact'],
    })
    if (withSlash.type !== 'system') throw new Error('Expected system message')
    expect(withSlash.slash_commands).toEqual(['/help', '/compact'])
  })

  test('maps user/assistant messages and normalizes tool_use block types', () => {
    const sessionId = '11111111-1111-1111-1111-111111111111'

    const user = createUserMessage('hello')
    const sdkUser = kodeMessageToSdkMessage(user, sessionId)
    expect(sdkUser?.type).toBe('user')
    if (!sdkUser || sdkUser.type !== 'user') {
      throw new Error('Expected user sdk message')
    }
    expect(sdkUser.session_id).toBe(sessionId)

    const assistant = createAssistantMessage('hi')
    const assistantWithToolUse = assistant as unknown as {
      message: { content: unknown[] }
    }
    assistantWithToolUse.message.content = [
      {
        type: 'server_tool_use',
        id: 'toolu_1',
        name: 'Grep',
        input: { pattern: 'x' },
      },
    ]
    const sdkAssistant = kodeMessageToSdkMessage(
      assistantWithToolUse as unknown as Parameters<
        typeof kodeMessageToSdkMessage
      >[0],
      sessionId,
    )
    expect(sdkAssistant?.type).toBe('assistant')
    if (!sdkAssistant || sdkAssistant.type !== 'assistant') {
      throw new Error('Expected assistant sdk message')
    }
    expect(sdkAssistant.message.content[0]?.type).toBe('tool_use')
  })

  test('result message matches SDK shape', () => {
    const msg = makeSdkResultMessage({
      sessionId: '22222222-2222-2222-2222-222222222222',
      result: 'ok',
      numTurns: 1,
      totalCostUsd: 0.01,
      durationMs: 123,
      durationApiMs: 0,
      isError: false,
    })
    expect(msg.type).toBe('result')
    if (msg.type !== 'result') throw new Error('Expected result message')
    expect(msg.subtype).toBe('success')
    expect(msg.session_id).toBe('22222222-2222-2222-2222-222222222222')
    expect(msg.result).toBe('ok')
  })
})
