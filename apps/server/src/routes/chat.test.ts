import { describe, expect, test } from 'bun:test'

import { SessionRegistry } from '../sessionRegistry'
import { DaemonTurnGate } from '../turnGate'
import { routeChat } from './chat'

type CapturedEvent = Record<string, unknown>

describe('HTTP chat turn state', () => {
  test('broadcasts running after acquire and idle after release', async () => {
    const sessionRegistry = new SessionRegistry()
    const session = sessionRegistry.create(process.cwd())
    const events: CapturedEvent[] = []
    let resolveIdle: (() => void) | undefined
    const idle = new Promise<void>(resolve => {
      resolveIdle = resolve
    })
    session.clients.add({
      send(data) {
        const event = JSON.parse(data) as CapturedEvent
        events.push(event)
        if (event.type === 'turn_state' && event.state === 'idle') {
          resolveIdle?.()
        }
      },
    })

    const response = await routeChat(
      new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.sessionId,
          prompt: 'hello',
        }),
      }),
      {
        sessionRegistry,
        turnGate: new DaemonTurnGate(),
        resolveCwd: async () => process.cwd(),
        echo: true,
        echoDelayMs: 10,
        commands: [],
        tools: [],
        toolNames: [],
        slashCommands: [],
        mcpClients: [],
      },
    )

    expect(response?.status).toBe(200)
    expect(events[0]).toEqual({
      type: 'turn_state',
      session_id: session.sessionId,
      state: 'running',
    })

    await idle

    const states = events.filter(event => event.type === 'turn_state')
    expect(states).toEqual([
      {
        type: 'turn_state',
        session_id: session.sessionId,
        state: 'running',
      },
      {
        type: 'turn_state',
        session_id: session.sessionId,
        state: 'idle',
      },
    ])
    expect(session.turnInFlight).toBe(false)
  })

  test('evicts excess HTTP-only sessions after their turn becomes idle', async () => {
    const sessionRegistry = new SessionRegistry(new Map(), {
      maxIdleSessions: 1,
    })
    const session = sessionRegistry.create(process.cwd())

    const response = await routeChat(
      new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.sessionId,
          prompt: 'hello',
        }),
      }),
      {
        sessionRegistry,
        turnGate: new DaemonTurnGate(),
        resolveCwd: async () => process.cwd(),
        echo: true,
        echoDelayMs: 100,
        commands: [],
        tools: [],
        toolNames: [],
        slashCommands: [],
        mcpClients: [],
      },
    )

    expect(response?.status).toBe(200)
    expect(session.turnInFlight).toBe(true)
    const retained = sessionRegistry.create(process.cwd())
    expect(sessionRegistry.size).toBe(2)

    const deadline = Date.now() + 2_000
    while (session.turnInFlight && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 5))
    }

    expect(session.turnInFlight).toBe(false)
    expect(sessionRegistry.size).toBe(1)
    expect(sessionRegistry.get(session.sessionId)).toBeNull()
    expect(sessionRegistry.get(retained.sessionId)).toBe(retained)
  })

  test('does not leak an HTTP busy result into a legacy WebSocket replay or stream', async () => {
    const sessionRegistry = new SessionRegistry()
    const session = sessionRegistry.create(process.cwd())
    const turnGate = new DaemonTurnGate()
    const lease = turnGate.tryAcquire(session)
    if (!lease) throw new Error('expected lease')
    const legacyEvents: CapturedEvent[] = []
    const correlatedEvents: CapturedEvent[] = []
    session.clients.add({
      send(data) {
        legacyEvents.push(JSON.parse(data) as CapturedEvent)
      },
    })
    session.clients.add({
      data: { correlatedEvents: true },
      send(data) {
        correlatedEvents.push(JSON.parse(data) as CapturedEvent)
      },
    })

    try {
      const response = await routeChat(
        new Request('http://localhost/api/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sessionId: session.sessionId,
            prompt: 'busy',
            clientMessageUuid: '77777777-7777-4777-8777-777777777777',
          }),
        }),
        {
          sessionRegistry,
          turnGate,
          resolveCwd: async () => process.cwd(),
          echo: true,
          echoDelayMs: 0,
          commands: [],
          tools: [],
          toolNames: [],
          slashCommands: [],
          mcpClients: [],
        },
      )

      expect(response?.status).toBe(409)
      expect(legacyEvents).toEqual([])
      expect(correlatedEvents).toHaveLength(1)
      expect(correlatedEvents[0]).toMatchObject({
        type: 'daemon_event',
        event: { type: 'result', is_error: true },
        metadata: {
          clientMessageUuid: '77777777-7777-4777-8777-777777777777',
        },
      })
      expect(session.eventJournal).toEqual([])
    } finally {
      lease.release()
    }
  })
})
