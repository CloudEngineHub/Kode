import { describe, expect, test } from 'bun:test'

import { AgentEventSchema } from '#protocol/agentEvent'

const session = {
  sessionId: 'session-1',
  slug: 'quiet-forest',
  customTitle: null,
  tag: 'server',
  summary: null,
  cwd: '/workspace',
  createdAt: '2026-07-09T12:00:00.000Z',
  modifiedAt: null,
}

describe('AgentEventSchema session list contract', () => {
  test('accepts the server session_list event and narrows its type', () => {
    const event = AgentEventSchema.parse({
      type: 'session_list',
      sessions: [session],
    })

    expect(event.type).toBe('session_list')
    if (event.type !== 'session_list') {
      throw new Error('Expected session_list event')
    }
    expect(event.sessions).toEqual([session])
  })

  test('accepts optional recursively validated session events', () => {
    expect(() =>
      AgentEventSchema.parse({
        type: 'session_list',
        sessions: [
          {
            ...session,
            events: [{ type: 'history_begin', sessionId: 'session-1' }],
          },
        ],
      }),
    ).not.toThrow()
  })

  test('keeps the event and session objects strict', () => {
    expect(
      AgentEventSchema.safeParse({
        type: 'session_list',
        sessions: [session],
        unexpected: true,
      }).success,
    ).toBe(false)

    expect(
      AgentEventSchema.safeParse({
        type: 'session_list',
        sessions: [{ ...session, unexpected: true }],
      }).success,
    ).toBe(false)
  })
})

describe('AgentEventSchema turn state contract', () => {
  test.each(['idle', 'running'] as const)(
    'accepts the strict %s state',
    state => {
      const event = AgentEventSchema.parse({
        type: 'turn_state',
        session_id: 'session-1',
        state,
      })

      expect(event).toEqual({
        type: 'turn_state',
        session_id: 'session-1',
        state,
      })
    },
  )

  test('rejects unknown states, missing session ids, and extra fields', () => {
    expect(
      AgentEventSchema.safeParse({
        type: 'turn_state',
        session_id: 'session-1',
        state: 'busy',
      }).success,
    ).toBe(false)
    expect(
      AgentEventSchema.safeParse({
        type: 'turn_state',
        state: 'idle',
      }).success,
    ).toBe(false)
    expect(
      AgentEventSchema.safeParse({
        type: 'turn_state',
        session_id: 'session-1',
        state: 'idle',
        unexpected: true,
      }).success,
    ).toBe(false)
  })
})
