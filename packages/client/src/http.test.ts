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

  private emit(type: 'open' | 'message' | 'close' | 'error', event: any): void {
    for (const listener of Array.from(this.listeners.get(type) ?? [])) {
      listener(event)
    }
  }
}

async function waitTick(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0))
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
})
