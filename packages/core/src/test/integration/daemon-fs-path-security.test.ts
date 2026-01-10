import { describe, expect, test } from 'bun:test'

import { startKodeDaemon } from '#daemon/server'
import { existsSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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

describe('daemon fs path security', () => {
  test('blocks symlink escape for fs_read/fs_write', async () => {
    if (process.platform === 'win32') return
    if (!existsSync('/etc')) return

    const projectDir = mkdtempSync(join(tmpdir(), 'kode-daemon-fs-'))
    const linkPath = join(projectDir, 'link')
    symlinkSync('/etc', linkPath, 'dir')

    const daemon = await startKodeDaemon({
      cwd: projectDir,
      port: 0,
      echo: true,
    })

    try {
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

      ws.send(JSON.stringify({ type: 'fs_read', path: 'link/hosts' }))

      const readErr = await waitForEvent(
        events,
        e =>
          e &&
          e.type === 'log' &&
          e.log?.level === 'error' &&
          String(e.log?.message ?? '').includes(
            'outside of the current project',
          ),
        5_000,
      )
      expect(readErr).toBeTruthy()
      expect(events.some(e => e?.type === 'fs_read_result')).toBe(false)

      ws.send(
        JSON.stringify({
          type: 'fs_write',
          path: 'link/kode-out.txt',
          content: 'hi',
        }),
      )

      const writeResult = await waitForEvent(
        events,
        e =>
          e && e.type === 'fs_write_result' && e.path === 'link/kode-out.txt',
        5_000,
      )
      expect(writeResult.ok).toBe(false)
      expect(String(writeResult.message ?? '')).toContain(
        'outside of the current project',
      )

      try {
        ws.close()
      } catch {}
    } finally {
      daemon.stop()
      rmSync(projectDir, { recursive: true, force: true })
    }
  }, 25_000)
})
