import { describe, expect, test } from 'bun:test'

import { startKodeDaemon } from '#daemon/server'

type AnyEvent = any

function getWsMessageData(ev: unknown): unknown {
  if (!ev || typeof ev !== 'object' || Array.isArray(ev)) return undefined
  return (ev as Record<string, unknown>).data
}

function waitForEvent(
  events: AnyEvent[],
  predicate: (e: AnyEvent) => boolean,
  timeoutMs: number,
): Promise<AnyEvent> {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const tick = () => {
      const found = events.find(predicate)
      if (found) return resolve(found)
      if (Date.now() > deadline) return reject(new Error('timeout'))
      setTimeout(tick, 10)
    }
    tick()
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

      const ws = new WebSocket(
        `ws://${daemon.host}:${daemon.port}/ws?token=${encodeURIComponent(
          daemon.token,
        )}`,
      )

      const events: AnyEvent[] = []
      ws.addEventListener('message', ev => {
        try {
          events.push(JSON.parse(String(getWsMessageData(ev))))
        } catch {}
      })

      await new Promise<void>((resolve, reject) => {
        ws.addEventListener('open', () => resolve(), { once: true })
        ws.addEventListener('error', () => reject(new Error('ws error')), {
          once: true,
        })
      })

      await waitForEvent(
        events,
        e => e && e.type === 'system' && e.subtype === 'init',
        5_000,
      )

      ws.send(JSON.stringify({ type: 'prompt', prompt: 'hello' }))

      const result = await waitForEvent(
        events,
        e => e && e.type === 'result',
        5_000,
      )
      expect(result.is_error).toBe(false)
      expect(result.result).toBe('hello')

      const assistant = await waitForEvent(
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

      try {
        ws.close()
      } catch {}
    } finally {
      daemon.stop()
    }
  }, 20_000)
})
