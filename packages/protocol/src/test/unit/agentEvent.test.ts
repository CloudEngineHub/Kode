import { describe, expect, test } from 'bun:test'

import {
  AgentEventSchema,
  DaemonWsEventSchema,
  normalizeDaemonWsEvent,
} from '#protocol/agentEvent'

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

describe('daemon correlated event envelope contract', () => {
  test('keeps raw events compatible while accepting a strict daemon projection', () => {
    const raw = {
      type: 'turn_state' as const,
      session_id: 'session-1',
      state: 'running' as const,
    }
    expect(AgentEventSchema.parse(raw)).toEqual(raw)

    const projected = DaemonWsEventSchema.parse({
      type: 'daemon_event',
      event: raw,
      metadata: {
        sessionId: 'session-1',
        turnId: '11111111-1111-4111-8111-111111111111',
        clientMessageUuid: '22222222-2222-4222-8222-222222222222',
        sequence: 12,
        replayed: false,
        snapshot: false,
      },
    })

    expect(normalizeDaemonWsEvent(projected)).toEqual({
      event: raw,
      metadata: {
        sessionId: 'session-1',
        turnId: '11111111-1111-4111-8111-111111111111',
        clientMessageUuid: '22222222-2222-4222-8222-222222222222',
        sequence: 12,
        replayed: false,
        snapshot: false,
      },
    })
  })

  test('rejects malformed or non-canonical correlation metadata', () => {
    expect(
      DaemonWsEventSchema.safeParse({
        type: 'daemon_event',
        event: { type: 'history_begin', sessionId: 'session-1' },
        metadata: {
          sessionId: 'session-1',
          turnId: null,
          clientMessageUuid: 'not-a-uuid',
          sequence: -1,
          replayed: true,
        },
      }).success,
    ).toBe(false)
  })

  test('defaults a pre-snapshot envelope to a non-snapshot delta', () => {
    const event = DaemonWsEventSchema.parse({
      type: 'daemon_event',
      event: { type: 'history_begin', sessionId: 'session-1' },
      metadata: {
        sessionId: 'session-1',
        turnId: null,
        clientMessageUuid: null,
        sequence: 0,
        replayed: true,
      },
    })

    expect(normalizeDaemonWsEvent(event).metadata?.snapshot).toBe(false)
  })
})
