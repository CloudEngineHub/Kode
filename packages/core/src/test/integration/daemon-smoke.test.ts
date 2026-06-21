import { describe, expect, test } from 'bun:test'
import { WebSocket as WsClient } from 'ws'

import { startKodeDaemon } from '#daemon/server'

type AnyEvent = any

function decodeWsMessageData(raw: unknown): string {
  if (typeof raw === 'string') return raw
  if (raw instanceof ArrayBuffer) {
    return new TextDecoder().decode(new Uint8Array(raw))
  }
  if (ArrayBuffer.isView(raw)) {
    const view = raw as ArrayBufferView
    return new TextDecoder().decode(
      new Uint8Array(view.buffer, view.byteOffset, view.byteLength),
    )
  }
  return String(raw ?? '')
}

function waitForEvent(
  label: string,
  events: AnyEvent[],
  predicate: (e: AnyEvent) => boolean,
  timeoutMs: number,
): Promise<AnyEvent> {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const tick = () => {
      const found = events.find(predicate)
      if (found) return resolve(found)
      if (Date.now() > deadline) {
        return reject(new Error(`timeout (${label}, events=${events.length})`))
      }
      setTimeout(tick, 10)
    }
    tick()
  })
}

async function closeWs(ws: WsClient): Promise<void> {
  await new Promise<void>(resolve => {
    const done = () => resolve()
    const timer = setTimeout(done, 250)
    try {
      ws.once('close', () => {
        clearTimeout(timer)
        done()
      })
      ws.close()
    } catch {
      clearTimeout(timer)
      done()
    }
  })
}

describe('daemon (Bun HTTP+WS)', () => {
  test('health + token gate + ws prompt (echo)', async () => {
    const daemon = await startKodeDaemon({
      cwd: process.cwd(),
      port: 0,
      echo: true,
    })

    try {
      const health = await fetch(
        `http://${daemon.host}:${daemon.port}/health`,
      ).then(r => r.json())
      expect(health.ok).toBe(true)

      const unauthorized = await fetch(
        `http://${daemon.host}:${daemon.port}/api/health`,
      )
      expect(unauthorized.status).toBe(401)

      const authorized = await fetch(
        `http://${daemon.host}:${daemon.port}/api/health?token=${encodeURIComponent(
          daemon.token,
        )}`,
      ).then(r => r.json())
      expect(authorized.ok).toBe(true)

      const ws = new WsClient(
        `ws://${daemon.host}:${daemon.port}/ws?token=${encodeURIComponent(
          daemon.token,
        )}`,
      )

      const events: AnyEvent[] = []
      ws.on('message', data => {
        try {
          events.push(JSON.parse(decodeWsMessageData(data)))
        } catch {}
      })

      await new Promise<void>((resolve, reject) => {
        ws.once('open', () => resolve())
        ws.once('error', err =>
          reject(
            err instanceof Error
              ? err
              : new Error(err ? String(err) : 'ws error'),
          ),
        )
      })

      await waitForEvent(
        'init',
        events,
        e => e && e.type === 'system' && e.subtype === 'init',
        5_000,
      )

      ws.send(JSON.stringify({ type: 'prompt', prompt: 'hello' }))

      const result = await waitForEvent(
        'result',
        events,
        e => e && e.type === 'result',
        5_000,
      )
      expect(result.is_error).toBe(false)
      expect(result.result).toBe('hello')

      const assistant = await waitForEvent(
        'assistant',
        events,
        e => e && e.type === 'assistant',
        5_000,
      )
      const text = Array.isArray(assistant?.message?.content)
        ? assistant.message.content
            .filter((b: any) => b && b.type === 'text')
            .map((b: any) => String(b.text ?? ''))
            .join('')
        : ''
      expect(text).toContain('hello')

      await closeWs(ws)
    } finally {
      daemon.stop()
    }
  }, 20_000)
})
