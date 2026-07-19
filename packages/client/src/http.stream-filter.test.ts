import { describe, expect, test } from 'bun:test'

import type { AgentEvent } from '@kode/protocol'

import { HttpClient } from './http'

class FakeWebSocket {
  static instances: FakeWebSocket[] = []

  readyState = 0
  sent: string[] = []
  private readonly listeners = new Map<string, Set<(event: any) => void>>()

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this)
  }

  addEventListener(
    type: 'open' | 'message' | 'close' | 'error',
    listener: (event: any) => void,
    options?: { once?: boolean },
  ): void {
    const wrapped =
      options?.once === true
        ? (event: any) => {
            this.removeEventListener(type, wrapped)
            listener(event)
          }
        : listener
    const listeners = this.listeners.get(type) ?? new Set()
    listeners.add(wrapped)
    this.listeners.set(type, listeners)
  }

  removeEventListener(
    type: 'open' | 'message' | 'close' | 'error',
    listener: (event: any) => void,
  ): void {
    this.listeners.get(type)?.delete(listener)
  }

  send(data: string): void {
    this.sent.push(data)
  }

  close(): void {
    this.readyState = 3
    this.emit('close', {})
  }

  open(): void {
    this.readyState = 1
    this.emit('open', {})
  }

  message(payload: unknown): void {
    this.emit('message', { data: JSON.stringify(payload) })
  }

  private emit(type: 'open' | 'message' | 'close' | 'error', event: any): void {
    for (const listener of Array.from(this.listeners.get(type) ?? [])) {
      listener(event)
    }
  }
}

async function waitTick(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0))
}

const sessionId = '11111111-1111-4111-8111-111111111111'
const otherSessionId = '22222222-2222-4222-8222-222222222222'
const clientMessageUuid = '33333333-3333-4333-8333-333333333333'
const otherClientMessageUuid = '44444444-4444-4444-8444-444444444444'

function initEvent(id = sessionId): AgentEvent {
  return { type: 'system', subtype: 'init', session_id: id }
}

function turnState(state: 'idle' | 'running', id = sessionId): AgentEvent {
  return { type: 'turn_state', session_id: id, state }
}

function userEvent(id: string, uuid: string, text = 'hello'): AgentEvent {
  return {
    type: 'user',
    session_id: id,
    uuid,
    message: { role: 'user', content: text },
  }
}

function assistantEvent(id: string, text: string): AgentEvent {
  return {
    type: 'assistant',
    session_id: id,
    uuid: `assistant-${text}`,
    message: {
      role: 'assistant',
      content: [{ type: 'text', text }],
    },
  }
}

function resultEvent(id: string, result: string, isError = false): AgentEvent {
  return {
    type: 'result',
    subtype: isError ? 'error_during_execution' : 'success',
    result,
    num_turns: 1,
    total_cost_usd: 0,
    duration_ms: 1,
    duration_api_ms: 0,
    is_error: isError,
    session_id: id,
    uuid: `result-${result}`,
  }
}

function envelope(args: {
  event: AgentEvent
  sequence: number
  sessionId?: string
  turnId?: string | null
  clientMessageUuid?: string | null
  replayed?: boolean
  snapshot?: boolean
}): unknown {
  return {
    type: 'daemon_event',
    event: args.event,
    metadata: {
      sessionId: args.sessionId ?? sessionId,
      turnId: args.turnId ?? null,
      clientMessageUuid: args.clientMessageUuid ?? null,
      sequence: args.sequence,
      replayed: args.replayed ?? false,
      snapshot: args.snapshot ?? false,
    },
  }
}

function completeHistory(ws: FakeWebSocket, id = sessionId): void {
  ws.message({ type: 'history_begin', sessionId: id })
  ws.message({ type: 'history_end', sessionId: id })
}

describe('HttpClient request correlation', () => {
  test('only yields its non-replayed correlated events while observers retain the session stream', async () => {
    FakeWebSocket.instances = []
    const client = new HttpClient({
      baseUrl: 'http://localhost:32123',
      token: 'token',
      webSocketImpl: FakeWebSocket,
    })
    const observed: Array<Record<string, unknown>> = []
    client.subscribeEvents(event =>
      observed.push(event as Record<string, unknown>),
    )

    const iterator = client.sendMessage('hello', { clientMessageUuid })
    const first = iterator.next()
    const ws = FakeWebSocket.instances[0]!
    ws.open()
    ws.message(initEvent())
    await waitTick()

    expect(JSON.parse(ws.sent[0] ?? '{}')).toMatchObject({
      type: 'prompt',
      prompt: 'hello',
      clientMessageUuid,
    })

    ws.message(
      envelope({
        event: turnState('running'),
        sequence: 1,
        turnId: 'turn-other',
        clientMessageUuid: otherClientMessageUuid,
      }),
    )
    ws.message(
      envelope({
        event: userEvent(sessionId, 'history-user', 'old prompt'),
        sequence: 2,
        turnId: 'history-turn',
        clientMessageUuid: '55555555-5555-4555-8555-555555555555',
        replayed: true,
      }),
    )
    ws.message(
      envelope({
        event: resultEvent(otherSessionId, 'wrong session'),
        sequence: 3,
        sessionId: otherSessionId,
        turnId: 'turn-other-session',
        clientMessageUuid: otherClientMessageUuid,
      }),
    )
    ws.message(
      envelope({
        event: resultEvent(sessionId, 'other result'),
        sequence: 4,
        turnId: 'turn-other',
        clientMessageUuid: otherClientMessageUuid,
      }),
    )

    let firstSettled = false
    void first.then(() => {
      firstSettled = true
    })
    await waitTick()
    expect(firstSettled).toBe(false)

    ws.message(
      envelope({
        event: turnState('running'),
        sequence: 5,
        turnId: 'turn-own',
        clientMessageUuid,
      }),
    )
    expect(await first).toMatchObject({
      value: { type: 'turn_state', turnId: 'turn-own', sequence: 5 },
    })

    const second = iterator.next()
    let secondSettled = false
    void second.then(() => {
      secondSettled = true
    })
    ws.message(
      envelope({
        event: resultEvent(sessionId, 'inconsistent turn metadata', true),
        sequence: 6,
        turnId: 'turn-own',
        clientMessageUuid: otherClientMessageUuid,
      }),
    )
    await waitTick()
    expect(secondSettled).toBe(false)

    ws.message(
      envelope({
        event: userEvent(sessionId, clientMessageUuid),
        sequence: 7,
        turnId: 'turn-own',
        clientMessageUuid,
      }),
    )
    ws.message(
      envelope({
        event: assistantEvent(sessionId, 'own answer'),
        sequence: 8,
        turnId: 'turn-own',
        clientMessageUuid,
      }),
    )
    ws.message(
      envelope({
        event: resultEvent(sessionId, 'done'),
        sequence: 9,
        turnId: 'turn-own',
        clientMessageUuid,
      }),
    )

    expect(await second).toMatchObject({ value: { type: 'user' } })
    expect(await iterator.next()).toMatchObject({
      value: { type: 'assistant' },
    })
    expect(await iterator.next()).toMatchObject({
      value: { type: 'result', result: 'done' },
    })
    expect(await iterator.next()).toMatchObject({ done: true })

    expect(observed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ turnId: 'turn-other', sequence: 1 }),
        expect.objectContaining({ replayed: true, sequence: 2 }),
        expect.objectContaining({ turnId: 'turn-own', sequence: 9 }),
      ]),
    )
  })

  test('accepts an exact correlated busy or error result without a user echo', async () => {
    FakeWebSocket.instances = []
    const client = new HttpClient({
      baseUrl: 'http://localhost:32123',
      token: 'token',
      webSocketImpl: FakeWebSocket,
    })
    const iterator = client.sendMessage('hello', { clientMessageUuid })
    const next = iterator.next()
    const ws = FakeWebSocket.instances[0]!
    ws.open()
    ws.message(initEvent())
    await waitTick()

    ws.message(
      envelope({
        event: resultEvent(sessionId, 'Another turn is already active', true),
        sequence: 1,
        turnId: 'busy-turn',
        clientMessageUuid,
      }),
    )

    expect(await next).toMatchObject({
      value: {
        type: 'result',
        is_error: true,
        turnId: 'busy-turn',
        clientMessageUuid,
      },
    })
    expect(await iterator.next()).toMatchObject({ done: true })
  })

  test('generates a UUID when the caller does not supply one', async () => {
    FakeWebSocket.instances = []
    const client = new HttpClient({
      baseUrl: 'http://localhost:32123',
      token: 'token',
      webSocketImpl: FakeWebSocket,
    })
    const iterator = client.sendMessage('hello')
    const next = iterator.next()
    const ws = FakeWebSocket.instances[0]!
    ws.open()
    ws.message(initEvent())
    await waitTick()

    const payload = JSON.parse(ws.sent[0] ?? '{}') as {
      clientMessageUuid?: string
    }
    expect(payload.clientMessageUuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )

    ws.message(
      envelope({
        event: resultEvent(sessionId, 'done'),
        sequence: 1,
        turnId: 'turn-auto',
        clientMessageUuid: payload.clientMessageUuid,
      }),
    )
    expect(await next).toMatchObject({ value: { type: 'result' } })
    expect(await iterator.next()).toMatchObject({ done: true })
  })

  test('uses the highest seen sequence as the reconnect cursor and ignores replay duplicates', async () => {
    FakeWebSocket.instances = []
    const client = new HttpClient({
      baseUrl: 'http://localhost:32123',
      token: 'token',
      webSocketImpl: FakeWebSocket,
    })
    const seen: Array<Record<string, unknown>> = []
    client.subscribeEvents(event => seen.push(event as Record<string, unknown>))

    const attached = client.attachSession(sessionId)
    const firstSocket = FakeWebSocket.instances[0]!
    firstSocket.open()
    firstSocket.message(initEvent())
    completeHistory(firstSocket)
    await attached

    const original = envelope({
      event: userEvent(sessionId, clientMessageUuid),
      sequence: 9,
      turnId: 'turn-reconnect',
      clientMessageUuid,
    })
    firstSocket.message(original)
    await waitTick()
    expect(seen).toHaveLength(4)

    client.disconnect()
    const reattached = client.attachSession(sessionId)
    const secondSocket = FakeWebSocket.instances[1]!
    const url = new URL(secondSocket.url)
    expect(url.searchParams.get('correlatedEvents')).toBe('1')
    expect(url.searchParams.get('afterSequence')).toBe('9')
    secondSocket.open()
    secondSocket.message(
      envelope({
        event: initEvent(),
        sequence: 11,
      }),
    )
    completeHistory(secondSocket)
    await reattached

    const replayed = envelope({
      event: assistantEvent(sessionId, 'after reconnect'),
      sequence: 10,
      turnId: 'turn-reconnect',
      clientMessageUuid,
      replayed: true,
    })
    // The reconnect init has sequence 11, but it is connection control rather
    // than journal data. The sequence-10 replay must still be delivered once.
    secondSocket.message(replayed)
    secondSocket.message(original)
    secondSocket.message(replayed)
    await waitTick()

    const requestEvents = seen.filter(
      event =>
        typeof event.sequence === 'number' &&
        event.type !== 'system' &&
        event.type !== 'history_begin' &&
        event.type !== 'history_end' &&
        event.type !== 'turn_state' &&
        event.type !== 'session_list',
    )
    expect(requestEvents).toEqual([
      expect.objectContaining({ sequence: 9 }),
      expect.objectContaining({ sequence: 10, replayed: true }),
    ])
  })

  test('delivers every durable sequence-zero snapshot without changing the resume cursor', async () => {
    FakeWebSocket.instances = []
    const client = new HttpClient({
      baseUrl: 'http://localhost:32123',
      token: 'token',
      webSocketImpl: FakeWebSocket,
    })
    const seen: Array<Record<string, unknown>> = []
    client.subscribeEvents(event => seen.push(event as Record<string, unknown>))

    const attached = client.attachSession(sessionId)
    const firstSocket = FakeWebSocket.instances[0]!
    firstSocket.open()
    firstSocket.message(initEvent())
    completeHistory(firstSocket)
    await attached

    firstSocket.message(
      envelope({
        event: userEvent(sessionId, clientMessageUuid),
        sequence: 7,
        turnId: 'turn-cursor',
        clientMessageUuid,
      }),
    )
    await waitTick()

    client.disconnect()
    const reattached = client.attachSession(sessionId)
    const secondSocket = FakeWebSocket.instances[1]!
    expect(new URL(secondSocket.url).searchParams.get('afterSequence')).toBe(
      '7',
    )
    secondSocket.open()
    secondSocket.message(initEvent())
    secondSocket.message(
      envelope({
        event: { type: 'history_begin', sessionId },
        sequence: 0,
        replayed: true,
        snapshot: true,
      }),
    )

    secondSocket.message(
      envelope({
        event: userEvent(sessionId, 'snapshot-user', 'persisted user'),
        sequence: 0,
        replayed: true,
        snapshot: true,
      }),
    )
    secondSocket.message(
      envelope({
        event: assistantEvent(sessionId, 'persisted assistant'),
        sequence: 0,
        replayed: true,
        snapshot: true,
      }),
    )
    secondSocket.message(
      envelope({
        event: { type: 'history_end', sessionId },
        sequence: 0,
        replayed: true,
        snapshot: true,
      }),
    )
    await reattached

    secondSocket.message(
      envelope({
        event: assistantEvent(sessionId, 'fresh after daemon reload'),
        sequence: 1,
        turnId: 'turn-after-reload',
        clientMessageUuid,
      }),
    )
    await waitTick()

    expect(
      seen.filter(
        event =>
          event.sequence === 0 &&
          (event.type === 'user' || event.type === 'assistant'),
      ),
    ).toEqual([
      expect.objectContaining({
        type: 'user',
        replayed: true,
        sequence: 0,
      }),
      expect.objectContaining({
        type: 'assistant',
        replayed: true,
        sequence: 0,
      }),
    ])
    expect(seen).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'assistant',
          sequence: 1,
          replayed: false,
        }),
      ]),
    )

    client.disconnect()
    const attachedAgain = client.attachSession(sessionId)
    const thirdSocket = FakeWebSocket.instances[2]!
    expect(new URL(thirdSocket.url).searchParams.get('afterSequence')).toBe('1')
    thirdSocket.open()
    thirdSocket.message(initEvent())
    completeHistory(thirdSocket)
    await attachedAgain
  })

  test('falls back to raw legacy events after a correlated daemon reconnects without envelopes', async () => {
    FakeWebSocket.instances = []
    const client = new HttpClient({
      baseUrl: 'http://localhost:32123',
      token: 'token',
      webSocketImpl: FakeWebSocket,
    })

    const firstAttach = client.attachSession(sessionId)
    const firstSocket = FakeWebSocket.instances[0]!
    firstSocket.open()
    firstSocket.message(
      envelope({
        event: initEvent(),
        sequence: 0,
      }),
    )
    completeHistory(firstSocket)
    await firstAttach

    client.disconnect()
    const legacyAttach = client.attachSession(sessionId)
    const legacySocket = FakeWebSocket.instances[1]!
    legacySocket.open()
    legacySocket.message(initEvent())
    completeHistory(legacySocket)
    await legacyAttach

    const iterator = client.sendMessage('legacy after downgrade', {
      clientMessageUuid,
    })
    const next = iterator.next()
    await waitTick()
    legacySocket.message(resultEvent(sessionId, 'legacy result'))

    expect(await next).toMatchObject({
      value: { type: 'result', result: 'legacy result' },
    })
    expect(await iterator.next()).toMatchObject({ done: true })
  })

  test('keeps the cursor through a healthy delta history boundary', async () => {
    FakeWebSocket.instances = []
    const client = new HttpClient({
      baseUrl: 'http://localhost:32123',
      token: 'token',
      webSocketImpl: FakeWebSocket,
    })

    const attached = client.attachSession(sessionId)
    const firstSocket = FakeWebSocket.instances[0]!
    firstSocket.open()
    firstSocket.message(initEvent())
    completeHistory(firstSocket)
    await attached

    firstSocket.message(
      envelope({
        event: userEvent(sessionId, clientMessageUuid),
        sequence: 7,
        turnId: 'turn-delta',
        clientMessageUuid,
      }),
    )
    await waitTick()

    client.disconnect()
    const reattached = client.attachSession(sessionId)
    const secondSocket = FakeWebSocket.instances[1]!
    expect(new URL(secondSocket.url).searchParams.get('afterSequence')).toBe(
      '7',
    )
    secondSocket.open()
    secondSocket.message(initEvent())
    secondSocket.message(
      envelope({
        event: { type: 'history_begin', sessionId },
        sequence: 0,
        replayed: true,
        snapshot: false,
      }),
    )
    secondSocket.message(
      envelope({
        event: { type: 'history_end', sessionId },
        sequence: 0,
        replayed: true,
        snapshot: false,
      }),
    )
    await reattached

    client.disconnect()
    const attachedAgain = client.attachSession(sessionId)
    const thirdSocket = FakeWebSocket.instances[2]!
    expect(new URL(thirdSocket.url).searchParams.get('afterSequence')).toBe('7')
    thirdSocket.open()
    thirdSocket.message(initEvent())
    completeHistory(thirdSocket)
    await attachedAgain
  })

  test('keeps legacy raw servers working without an assistant-first time fallback', async () => {
    FakeWebSocket.instances = []
    const client = new HttpClient({
      baseUrl: 'http://localhost:32123',
      token: 'token',
      webSocketImpl: FakeWebSocket,
    })
    const iterator = client.sendMessage('hello', { clientMessageUuid })
    const next = iterator.next()
    const ws = FakeWebSocket.instances[0]!
    ws.open()
    ws.message(initEvent())
    await waitTick()

    ws.message({ type: 'history_begin', sessionId })
    ws.message(userEvent(sessionId, 'history-user', 'old prompt'))
    ws.message({ type: 'history_end', sessionId })
    ws.message(resultEvent(sessionId, 'legacy done'))

    expect(await next).toMatchObject({
      value: { type: 'result', result: 'legacy done' },
    })
    expect(await iterator.next()).toMatchObject({ done: true })
  })
})
