import { describe, expect, test } from 'bun:test'

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

  error(): void {
    this.emit('error', {})
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

async function waitMs(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms))
}

function initEvent(sessionId: string) {
  return {
    type: 'system' as const,
    subtype: 'init',
    session_id: sessionId,
  }
}

function userEvent(sessionId: string, text: string, uuid: string) {
  return {
    type: 'user' as const,
    session_id: sessionId,
    uuid,
    message: { role: 'user' as const, content: text },
  }
}

function completeHistory(ws: FakeWebSocket, sessionId: string): void {
  ws.message({ type: 'history_begin', sessionId })
  ws.message({ type: 'history_end', sessionId })
}

describe('HttpClient', () => {
  test('sendMessage rejects when the WebSocket closes before result', async () => {
    FakeWebSocket.instances = []
    const client = new HttpClient({
      baseUrl: 'http://localhost:32123',
      token: 'token',
      webSocketImpl: FakeWebSocket,
    })

    const iterator = client.sendMessage('hello')
    const next = iterator.next()
    const ws = FakeWebSocket.instances[0]
    expect(ws).toBeDefined()

    ws!.open()
    ws!.message(initEvent('session'))
    await waitTick()

    expect(JSON.parse(ws!.sent[0] ?? '{}')).toEqual({
      type: 'prompt',
      prompt: 'hello',
    })

    ws!.close()

    await expect(next).rejects.toThrow(
      'WebSocket connection closed before the response completed',
    )
    expect(client.isConnected()).toBe(false)
  })

  test('sendMessage still yields queued result before completing', async () => {
    FakeWebSocket.instances = []
    const client = new HttpClient({
      baseUrl: 'http://localhost:32123',
      token: 'token',
      webSocketImpl: FakeWebSocket,
    })

    const iterator = client.sendMessage('hello')
    const first = iterator.next()
    const ws = FakeWebSocket.instances[0]!
    ws.open()
    ws.message(initEvent('session'))
    await waitTick()

    ws.message({
      type: 'result',
      subtype: 'success',
      result: 'ok',
      num_turns: 1,
      total_cost_usd: 0,
      duration_ms: 1,
      duration_api_ms: 0,
      is_error: false,
      session_id: 'session',
      uuid: 'result-1',
    })

    expect(await first).toMatchObject({
      done: false,
      value: { type: 'result', result: 'ok' },
    })
    expect(await iterator.next()).toMatchObject({ done: true })
  })

  test('notifies subscribers when the websocket opens and closes', async () => {
    FakeWebSocket.instances = []
    const client = new HttpClient({
      baseUrl: 'http://localhost:32123',
      token: 'token',
      webSocketImpl: FakeWebSocket,
    })
    const states: boolean[] = []
    const unsubscribe = client.onConnectionChange(connected => {
      states.push(connected)
    })

    const iterator = client.sendMessage('hello')
    const first = iterator.next()
    const ws = FakeWebSocket.instances[0]!
    ws.open()
    ws.message(initEvent('session'))
    await waitTick()
    ws.message({
      type: 'result',
      subtype: 'success',
      result: 'ok',
      num_turns: 1,
      total_cost_usd: 0,
      duration_ms: 1,
      duration_api_ms: 0,
      is_error: false,
      session_id: 'session',
      uuid: 'result-1',
    })
    await first
    await iterator.next()

    ws.close()
    unsubscribe()

    expect(states).toEqual([true, false])
  })

  test('attachSession connects with the requested session id and waits for history', async () => {
    FakeWebSocket.instances = []
    const client = new HttpClient({
      baseUrl: 'http://localhost:32123',
      token: 'token',
      workspaceId: 'workspace-a',
      webSocketImpl: FakeWebSocket,
    })
    const sessionId = '11111111-1111-4111-8111-111111111111'

    let attached = false
    const attaching = client.attachSession(sessionId).then(() => {
      attached = true
    })
    const ws = FakeWebSocket.instances[0]!
    const url = new URL(ws.url)

    expect(url.pathname).toBe('/ws')
    expect(url.searchParams.get('workspace')).toBe('workspace-a')
    expect(url.searchParams.get('session_id')).toBe(sessionId)

    ws.open()
    await waitTick()
    expect(attached).toBe(false)

    ws.message(initEvent(sessionId))
    await waitTick()
    expect(attached).toBe(false)
    completeHistory(ws, sessionId)
    await attaching

    expect(client.getAttachedSessionId()).toBe(sessionId)
  })

  test('concurrent attachSession calls share the same connection attempt', async () => {
    FakeWebSocket.instances = []
    const client = new HttpClient({
      baseUrl: 'http://localhost:32123',
      token: 'token',
      webSocketImpl: FakeWebSocket,
    })
    const sessionId = '12121212-1212-4212-8212-121212121212'

    const first = client.attachSession(sessionId)
    const second = client.attachSession(sessionId)

    expect(FakeWebSocket.instances).toHaveLength(1)
    const ws = FakeWebSocket.instances[0]!
    ws.open()
    ws.message(initEvent(sessionId))
    completeHistory(ws, sessionId)

    await Promise.all([first, second])
    expect(client.getAttachedSessionId()).toBe(sessionId)
  })

  test('attachSession rejects an unexpected init session id', async () => {
    FakeWebSocket.instances = []
    const client = new HttpClient({
      baseUrl: 'http://localhost:32123',
      token: 'token',
      webSocketImpl: FakeWebSocket,
    })
    const requested = '13131313-1313-4313-8313-131313131313'
    const unexpected = '14141414-1414-4414-8414-141414141414'

    const attaching = client.attachSession(requested)
    const ws = FakeWebSocket.instances[0]!
    ws.open()
    ws.message(initEvent(unexpected))

    await expect(attaching).rejects.toThrow(
      `Server attached unexpected session (${unexpected}; expected ${requested})`,
    )
    expect(client.getAttachedSessionId()).toBeNull()
    expect(client.isConnected()).toBe(false)
  })

  test('startSession waits for init and returns the announced session id', async () => {
    FakeWebSocket.instances = []
    const client = new HttpClient({
      baseUrl: 'http://localhost:32123',
      token: 'token',
      webSocketImpl: FakeWebSocket,
    })
    const sessionId = '22222222-2222-4222-8222-222222222222'

    const starting = client.startSession()
    const ws = FakeWebSocket.instances[0]!
    expect(new URL(ws.url).searchParams.has('session_id')).toBe(false)

    ws.open()
    ws.message(initEvent(sessionId))

    expect(await starting).toBe(sessionId)
    expect(client.getAttachedSessionId()).toBe(sessionId)
  })

  test('registers message handling before open so an early init is retained', async () => {
    FakeWebSocket.instances = []
    const client = new HttpClient({
      baseUrl: 'http://localhost:32123',
      token: 'token',
      webSocketImpl: FakeWebSocket,
    })
    const sessionId = '33333333-3333-4333-8333-333333333333'

    const starting = client.startSession()
    const ws = FakeWebSocket.instances[0]!
    ws.message(initEvent(sessionId))
    ws.open()

    expect(await starting).toBe(sessionId)
  })

  test('persistent subscribers receive idle events outside sendMessage', async () => {
    FakeWebSocket.instances = []
    const client = new HttpClient({
      baseUrl: 'http://localhost:32123',
      token: 'token',
      webSocketImpl: FakeWebSocket,
    })
    const sessionId = '44444444-4444-4444-8444-444444444444'
    const seen: string[] = []
    const unsubscribe = client.subscribeEvents(event => {
      if (event.type === 'user') seen.push(String(event.message.content))
    })

    const starting = client.startSession()
    const ws = FakeWebSocket.instances[0]!
    ws.open()
    ws.message(initEvent(sessionId))
    await starting

    ws.message(userEvent(sessionId, 'from another client', 'user-remote'))
    unsubscribe()

    expect(seen).toEqual(['from another client'])
  })

  test('switching sessions preserves persistent event subscribers', async () => {
    FakeWebSocket.instances = []
    const client = new HttpClient({
      baseUrl: 'http://localhost:32123',
      token: 'token',
      webSocketImpl: FakeWebSocket,
    })
    const firstId = '55555555-5555-4555-8555-555555555555'
    const secondId = '66666666-6666-4666-8666-666666666666'
    const seen: string[] = []
    client.subscribeEvents(event => {
      if (event.type === 'user') seen.push(String(event.message.content))
    })

    const starting = client.startSession()
    const firstSocket = FakeWebSocket.instances[0]!
    firstSocket.open()
    firstSocket.message(initEvent(firstId))
    await starting
    firstSocket.message(userEvent(firstId, 'first', 'user-first'))

    const attaching = client.attachSession(secondId)
    const secondSocket = FakeWebSocket.instances[1]!
    expect(firstSocket.readyState).toBe(3)
    secondSocket.open()
    secondSocket.message(initEvent(secondId))
    completeHistory(secondSocket, secondId)
    await attaching
    secondSocket.message(userEvent(secondId, 'second', 'user-second'))

    expect(seen).toEqual(['first', 'second'])
    expect(client.getAttachedSessionId()).toBe(secondId)
  })

  test('attachSession rejects websocket errors while connecting', async () => {
    FakeWebSocket.instances = []
    const client = new HttpClient({
      baseUrl: 'http://localhost:32123',
      token: 'token',
      webSocketImpl: FakeWebSocket,
    })

    const attaching = client.attachSession(
      '77777777-7777-4777-8777-777777777777',
    )
    FakeWebSocket.instances[0]!.error()

    await expect(attaching).rejects.toThrow('WebSocket connection error')
    expect(client.isConnected()).toBe(false)
  })

  test('attachSession rejects closes before initialization', async () => {
    FakeWebSocket.instances = []
    const client = new HttpClient({
      baseUrl: 'http://localhost:32123',
      token: 'token',
      webSocketImpl: FakeWebSocket,
    })

    const attaching = client.attachSession(
      '88888888-8888-4888-8888-888888888888',
    )
    FakeWebSocket.instances[0]!.close()

    await expect(attaching).rejects.toThrow(
      'WebSocket connection closed before session synchronization completed',
    )
    expect(client.isConnected()).toBe(false)
  })

  test('attachSession rejects disconnects before history replay completes', async () => {
    FakeWebSocket.instances = []
    const client = new HttpClient({
      baseUrl: 'http://localhost:32123',
      token: 'token',
      webSocketImpl: FakeWebSocket,
    })
    const sessionId = '89898989-8989-4989-8989-898989898989'

    const attaching = client.attachSession(sessionId)
    const ws = FakeWebSocket.instances[0]!
    ws.open()
    ws.message(initEvent(sessionId))
    ws.message({ type: 'history_begin', sessionId })
    ws.close()

    await expect(attaching).rejects.toThrow(
      'WebSocket connection closed before session synchronization completed',
    )
    expect(client.isConnected()).toBe(false)
  })

  test('uses a separate timeout for history synchronization', async () => {
    FakeWebSocket.instances = []
    const client = new HttpClient({
      baseUrl: 'http://localhost:32123',
      token: 'token',
      webSocketImpl: FakeWebSocket,
      connectTimeoutMs: 5,
      historySyncTimeoutMs: 100,
    })
    const sessionId = '90909090-9090-4090-8090-909090909090'

    const attaching = client.attachSession(sessionId)
    const ws = FakeWebSocket.instances[0]!
    ws.open()
    ws.message(initEvent(sessionId))

    await waitMs(15)
    completeHistory(ws, sessionId)

    await attaching
    expect(client.getAttachedSessionId()).toBe(sessionId)
  })

  test('rejects when history synchronization exceeds its own timeout', async () => {
    FakeWebSocket.instances = []
    const client = new HttpClient({
      baseUrl: 'http://localhost:32123',
      token: 'token',
      webSocketImpl: FakeWebSocket,
      connectTimeoutMs: 100,
      historySyncTimeoutMs: 5,
    })
    const sessionId = '91919191-9191-4191-8191-919191919191'

    const attaching = client.attachSession(sessionId)
    const ws = FakeWebSocket.instances[0]!
    ws.open()
    ws.message(initEvent(sessionId))

    await expect(attaching).rejects.toThrow(
      'WebSocket history synchronization timeout',
    )
  })

  test('concurrent session startup and send share one connection attempt', async () => {
    FakeWebSocket.instances = []
    const client = new HttpClient({
      baseUrl: 'http://localhost:32123',
      token: 'token',
      webSocketImpl: FakeWebSocket,
    })
    const sessionId = '99999999-9999-4999-8999-999999999999'

    const starting = client.startSession()
    const iterator = client.sendMessage('hello')
    const first = iterator.next()

    expect(FakeWebSocket.instances).toHaveLength(1)
    const ws = FakeWebSocket.instances[0]!
    ws.open()
    ws.message(initEvent(sessionId))

    expect(await starting).toBe(sessionId)
    await waitTick()
    expect(JSON.parse(ws.sent[0] ?? '{}')).toEqual({
      type: 'prompt',
      prompt: 'hello',
    })

    ws.message({
      type: 'result',
      subtype: 'success',
      result: 'ok',
      num_turns: 1,
      total_cost_usd: 0,
      duration_ms: 1,
      duration_api_ms: 0,
      is_error: false,
      session_id: sessionId,
      uuid: 'result-concurrent',
    })

    expect(await first).toMatchObject({
      done: false,
      value: { type: 'result', result: 'ok' },
    })
    expect(await iterator.next()).toMatchObject({ done: true })
  })

  test('rejects a second concurrent send without consuming the first result', async () => {
    FakeWebSocket.instances = []
    const client = new HttpClient({
      baseUrl: 'http://localhost:32123',
      token: 'token',
      webSocketImpl: FakeWebSocket,
    })

    const firstIterator = client.sendMessage('first')
    const first = firstIterator.next()
    const ws = FakeWebSocket.instances[0]!
    ws.open()
    ws.message(initEvent('session'))
    await waitTick()

    const secondIterator = client.sendMessage('second')
    await expect(secondIterator.next()).rejects.toThrow(
      'Another message is already in flight for this client',
    )

    ws.message({
      type: 'result',
      subtype: 'success',
      result: 'first result',
      num_turns: 1,
      total_cost_usd: 0,
      duration_ms: 1,
      duration_api_ms: 0,
      is_error: false,
      session_id: 'session',
      uuid: 'result-first',
    })

    expect(await first).toMatchObject({
      done: false,
      value: { type: 'result', result: 'first result' },
    })
    expect(await firstIterator.next()).toMatchObject({ done: true })
  })

  test('cancelRequest during connection prevents the prompt from being sent', async () => {
    FakeWebSocket.instances = []
    const client = new HttpClient({
      baseUrl: 'http://localhost:32123',
      token: 'token',
      webSocketImpl: FakeWebSocket,
    })

    const iterator = client.sendMessage('should not send')
    const first = iterator.next()
    const ws = FakeWebSocket.instances[0]!

    client.cancelRequest()

    expect(await first).toMatchObject({ done: true })
    expect(ws.sent).toEqual([])

    // The shared socket may still finish connecting for a later request, but
    // the cancelled send must remain completed and must not emit a prompt.
    ws.open()
    ws.message(initEvent('session'))
    await waitTick()

    expect(ws.sent).toEqual([])
  })

  test('cancelRequest during history sync stays local and completes promptly', async () => {
    FakeWebSocket.instances = []
    const client = new HttpClient({
      baseUrl: 'http://localhost:32123',
      token: 'token',
      webSocketImpl: FakeWebSocket,
    })
    const sessionId = '92929292-9292-4292-8292-929292929292'

    const attaching = client.attachSession(sessionId)
    const ws = FakeWebSocket.instances[0]!
    ws.open()
    ws.message(initEvent(sessionId))
    ws.message({ type: 'history_begin', sessionId })

    const iterator = client.sendMessage('should remain local')
    const first = iterator.next()
    client.cancelRequest()

    expect(await first).toMatchObject({ done: true })
    expect(ws.sent).toEqual([])

    ws.message({ type: 'history_end', sessionId })
    await attaching
    expect(ws.sent).toEqual([])
  })

  test('cancelRequest sends cancel after the prompt is in flight', async () => {
    FakeWebSocket.instances = []
    const client = new HttpClient({
      baseUrl: 'http://localhost:32123',
      token: 'token',
      webSocketImpl: FakeWebSocket,
    })

    const iterator = client.sendMessage('stop me')
    const first = iterator.next()
    const ws = FakeWebSocket.instances[0]!
    ws.open()
    ws.message(initEvent('session'))
    await waitTick()

    client.cancelRequest()
    expect(ws.sent.map(message => JSON.parse(message))).toEqual([
      { type: 'prompt', prompt: 'stop me' },
      { type: 'cancel' },
    ])

    ws.message({
      type: 'result',
      subtype: 'error_during_execution',
      result: '',
      num_turns: 1,
      total_cost_usd: 0,
      duration_ms: 1,
      duration_api_ms: 0,
      is_error: true,
      session_id: 'session',
      uuid: 'result-cancelled',
    })

    expect(await first).toMatchObject({
      done: false,
      value: { type: 'result', is_error: true },
    })
    expect(await iterator.next()).toMatchObject({ done: true })
  })

  test('listSessions reads sessions over HTTP without opening a websocket', async () => {
    FakeWebSocket.instances = []
    const fetchCalls: Array<{ url: string; headers: Record<string, string> }> =
      []
    const client = new HttpClient({
      baseUrl: 'http://localhost:32123',
      token: 'token',
      workspaceId: 'workspace-a',
      webSocketImpl: FakeWebSocket,
      fetchImpl: async (input, init) => {
        fetchCalls.push({
          url: String(input),
          headers: init?.headers ?? {},
        })
        return Response.json({
          sessions: [
            {
              sessionId: '11111111-1111-4111-8111-111111111111',
              slug: 'saved-session',
              customTitle: null,
              tag: null,
              summary: null,
              cwd: '/repo',
              createdAt: null,
              modifiedAt: null,
            },
          ],
        })
      },
    })

    const sessions = await client.listSessions()

    expect(FakeWebSocket.instances).toHaveLength(0)
    expect(fetchCalls).toEqual([
      {
        url: 'http://localhost:32123/api/sessions?workspace=workspace-a',
        headers: { authorization: 'Bearer token' },
      },
    ])
    expect(sessions).toHaveLength(1)
    expect(sessions[0]?.slug).toBe('saved-session')
  })

  test('listSessions rejects failed HTTP session list responses', async () => {
    const client = new HttpClient({
      baseUrl: 'http://localhost:32123',
      token: 'token',
      webSocketImpl: FakeWebSocket,
      fetchImpl: async () =>
        Response.json({ ok: false, error: 'missing' }, { status: 503 }),
    })

    await expect(client.listSessions()).rejects.toThrow(
      'Failed to list sessions (503)',
    )
  })

  test('listSessions rejects malformed HTTP session list responses', async () => {
    const client = new HttpClient({
      baseUrl: 'http://localhost:32123',
      token: 'token',
      webSocketImpl: FakeWebSocket,
      fetchImpl: async () => Response.json({ sessions: [{ slug: 'missing' }] }),
    })

    await expect(client.listSessions()).rejects.toThrow(
      'Invalid sessions response',
    )
  })

  test('getRuntimeStatus reads daemon status over HTTP', async () => {
    FakeWebSocket.instances = []
    const fetchCalls: Array<{ url: string; headers: Record<string, string> }> =
      []
    const client = new HttpClient({
      baseUrl: 'http://localhost:32123',
      token: 'token',
      workspaceId: 'workspace-a',
      webSocketImpl: FakeWebSocket,
      fetchImpl: async (input, init) => {
        fetchCalls.push({
          url: String(input),
          headers: init?.headers ?? {},
        })
        return Response.json({
          ok: true,
          transport: 'daemon',
          pid: 123,
          version: '2.2.1',
          activeSessions: 2,
        })
      },
    })

    const status = await client.getRuntimeStatus()

    expect(FakeWebSocket.instances).toHaveLength(0)
    expect(fetchCalls).toEqual([
      {
        url: 'http://localhost:32123/api/health?workspace=workspace-a',
        headers: { authorization: 'Bearer token' },
      },
    ])
    expect(status).toEqual({
      ok: true,
      transport: 'daemon',
      pid: 123,
      version: '2.2.1',
      activeSessions: 2,
    })
  })

  test('getRuntimeStatus rejects failed HTTP status responses', async () => {
    const client = new HttpClient({
      baseUrl: 'http://localhost:32123',
      token: 'token',
      webSocketImpl: FakeWebSocket,
      fetchImpl: async () =>
        Response.json({ ok: false, error: 'missing' }, { status: 503 }),
    })

    await expect(client.getRuntimeStatus()).rejects.toThrow(
      'Failed to read runtime status (503)',
    )
  })

  test('getRuntimeStatus rejects malformed HTTP status responses', async () => {
    const client = new HttpClient({
      baseUrl: 'http://localhost:32123',
      token: 'token',
      webSocketImpl: FakeWebSocket,
      fetchImpl: async () => Response.json({ ok: true }),
    })

    await expect(client.getRuntimeStatus()).rejects.toThrow(
      'Invalid runtime status response',
    )
  })

  test('loadSession reads history over HTTP without resuming websocket session', async () => {
    FakeWebSocket.instances = []
    const fetchCalls: Array<{ url: string; headers: Record<string, string> }> =
      []
    const client = new HttpClient({
      baseUrl: 'http://localhost:32123',
      token: 'token',
      workspaceId: 'workspace-a',
      webSocketImpl: FakeWebSocket,
      fetchImpl: async (input, init) => {
        fetchCalls.push({
          url: String(input),
          headers: init?.headers ?? {},
        })
        return Response.json({
          sessionId: '11111111-1111-4111-8111-111111111111',
          slug: 'saved-session',
          customTitle: null,
          tag: null,
          summary: null,
          cwd: '/repo',
          createdAt: null,
          modifiedAt: null,
          events: [
            {
              type: 'user',
              uuid: 'user-1',
              message: { role: 'user', content: 'hello' },
            },
          ],
        })
      },
    })

    const session = await client.loadSession(
      '11111111-1111-4111-8111-111111111111',
    )

    expect(FakeWebSocket.instances).toHaveLength(0)
    expect(fetchCalls).toEqual([
      {
        url: 'http://localhost:32123/api/sessions/11111111-1111-4111-8111-111111111111?workspace=workspace-a',
        headers: { authorization: 'Bearer token' },
      },
    ])
    expect(session.slug).toBe('saved-session')
    expect(session.events).toHaveLength(1)
    expect(session.events?.[0]?.type).toBe('user')
  })

  test('loadSession rejects failed HTTP history responses', async () => {
    const client = new HttpClient({
      baseUrl: 'http://localhost:32123',
      token: 'token',
      webSocketImpl: FakeWebSocket,
      fetchImpl: async () =>
        Response.json({ ok: false, error: 'missing' }, { status: 404 }),
    })

    await expect(
      client.loadSession('11111111-1111-4111-8111-111111111111'),
    ).rejects.toThrow('Failed to load session (404)')
  })

  test('loadSession rejects malformed HTTP history responses', async () => {
    const client = new HttpClient({
      baseUrl: 'http://localhost:32123',
      token: 'token',
      webSocketImpl: FakeWebSocket,
      fetchImpl: async () => Response.json({ ok: true }),
    })

    await expect(
      client.loadSession('11111111-1111-4111-8111-111111111111'),
    ).rejects.toThrow('Invalid session response')
  })
})
