import { describe, expect, test } from 'bun:test'

import {
  makeSdkInitMessage as legacyMakeSdkInitMessage,
  makeSdkResultMessage as legacyMakeSdkResultMessage,
} from '#protocol/utils/kodeAgentStreamJson'
import { makeSdkInitMessage, makeSdkResultMessage } from '#protocol/streamJson'
import { AgentEventSchema } from '#protocol/agentEvent'
import { tryParseStructuredInputLine } from '#protocol/structuredStdio'

describe('protocol contracts (compat + stability)', () => {
  test('stream-json helpers are shared with legacy exports', () => {
    expect(legacyMakeSdkInitMessage).toBe(makeSdkInitMessage)
    expect(legacyMakeSdkResultMessage).toBe(makeSdkResultMessage)

    expect(makeSdkInitMessage({ sessionId: 's', cwd: '/x' })).toEqual({
      type: 'system',
      subtype: 'init',
      session_id: 's',
      cwd: '/x',
      model: undefined,
      tools: undefined,
    })

    expect(
      makeSdkInitMessage({
        sessionId: 's',
        cwd: '/x',
        slashCommands: ['help', 'agents'],
      }),
    ).toEqual({
      type: 'system',
      subtype: 'init',
      session_id: 's',
      cwd: '/x',
      model: undefined,
      tools: undefined,
      slash_commands: ['help', 'agents'],
    })

    const ok = makeSdkResultMessage({
      sessionId: 's',
      result: 'hello',
      numTurns: 1,
      totalCostUsd: 0.1,
      durationMs: 5,
      durationApiMs: 3,
      isError: false,
    })
    expect(ok.type).toBe('result')
    if (ok.type !== 'result') throw new Error('Expected result message')
    expect(ok.subtype).toBe('success')
    expect('structured_output' in ok).toBe(false)

    const err = makeSdkResultMessage({
      sessionId: 's',
      result: 'boom',
      structuredOutput: { a: 1 },
      numTurns: 1,
      totalCostUsd: 0.1,
      durationMs: 5,
      durationApiMs: 3,
      isError: true,
    })
    expect(err.type).toBe('result')
    if (err.type !== 'result') throw new Error('Expected result message')
    expect(err.subtype).toBe('error_during_execution')
    expect('structured_output' in err).toBe(true)
  })

  test('structured stdio parser stays strict and stable', () => {
    expect(tryParseStructuredInputLine('')).toBe(null)
    expect(tryParseStructuredInputLine('   ')).toBe(null)
    expect(tryParseStructuredInputLine('not json')).toBe(null)
    expect(tryParseStructuredInputLine('[]')).toBe(null)
    expect(tryParseStructuredInputLine('{}')).toBe(null)
    expect(tryParseStructuredInputLine('{"type":123}')).toBe(null)

    expect(tryParseStructuredInputLine('{"type":"keep_alive"}')).toEqual({
      type: 'keep_alive',
    })

    expect(
      tryParseStructuredInputLine(
        '{"type":"user","uuid":"u1","message":{"role":"user","content":"hi"}}',
      ),
    ).toEqual({
      type: 'user',
      uuid: 'u1',
      message: { role: 'user', content: 'hi' },
    })

    expect(
      tryParseStructuredInputLine(
        '{"type":"control_request","request_id":"r1","request":{"subtype":"interrupt"}}',
      ),
    ).toEqual({
      type: 'control_request',
      request_id: 'r1',
      request: { subtype: 'interrupt' },
    })
  })

  test('AgentEventSchema accepts current stream-json messages', () => {
    expect(() =>
      AgentEventSchema.parse(makeSdkInitMessage({ sessionId: 's', cwd: '/x' })),
    ).not.toThrow()

    expect(() =>
      AgentEventSchema.parse({
        type: 'user',
        session_id: 's',
        uuid: 'u1',
        parent_tool_use_id: null,
        message: { role: 'user', content: 'hi' },
      }),
    ).not.toThrow()

    expect(() =>
      AgentEventSchema.parse({
        type: 'assistant',
        session_id: 's',
        uuid: 'a1',
        parent_tool_use_id: null,
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'ok' }],
        },
      }),
    ).not.toThrow()

    expect(() =>
      AgentEventSchema.parse(
        makeSdkResultMessage({
          sessionId: 's',
          result: 'done',
          numTurns: 1,
          totalCostUsd: 0,
          durationMs: 1,
          durationApiMs: 1,
          isError: false,
        }),
      ),
    ).not.toThrow()
  })
})
