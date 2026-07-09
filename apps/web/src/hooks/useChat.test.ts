import { describe, expect, test } from 'bun:test'

import { __useChatForTests } from './useChat'

describe('useChat helpers', () => {
  test('creates visible log events for caught errors', () => {
    expect(
      __useChatForTests.createErrorLogEvent(new Error('socket closed')),
    ).toEqual({
      type: 'log',
      log: {
        level: 'error',
        message: 'socket closed',
      },
    })
  })

  test('routes SDK and history events to their owning session', () => {
    expect(
      __useChatForTests.getEventSessionId({
        type: 'history_begin',
        sessionId: 'session-a',
      }),
    ).toBe('session-a')

    expect(
      __useChatForTests.getEventSessionId({
        type: 'user',
        session_id: 'session-b',
        message: { role: 'user', content: 'hello' },
      }),
    ).toBe('session-b')
  })

  test('deduplicates replayed events with stable UUIDs', () => {
    const event = {
      type: 'user' as const,
      session_id: 'session-a',
      uuid: 'event-1',
      message: { role: 'user' as const, content: 'hello' },
    }

    const once = __useChatForTests.appendUniqueEvent([], event)
    const twice = __useChatForTests.appendUniqueEvent(once, event)

    expect(once).toHaveLength(1)
    expect(twice).toHaveLength(1)
  })

  test('maps authoritative turn state to the sending indicator', () => {
    expect(
      __useChatForTests.getTurnStateSending({
        type: 'turn_state',
        session_id: 'session-a',
        state: 'running',
      }),
    ).toBe(true)
    expect(
      __useChatForTests.getTurnStateSending({
        type: 'turn_state',
        session_id: 'session-a',
        state: 'idle',
      }),
    ).toBe(false)
  })
})
