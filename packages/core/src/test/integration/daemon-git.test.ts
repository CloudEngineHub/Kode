import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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

function hasGit(): boolean {
  const res = spawnSync('git', ['--version'], { encoding: 'utf8' })
  return res.status === 0 && !res.error
}

describe('daemon git endpoints (WS)', () => {
  const maybeTest = hasGit() ? test : test.skip

  maybeTest(
    'git status/diff/stage/commit works (permission-gated)',
    async () => {
      const repoDir = mkdtempSync(join(tmpdir(), 'kode-daemon-git-'))
      try {
        const run = (args: string[]) => {
          const res = spawnSync('git', args, { cwd: repoDir, encoding: 'utf8' })
          if (res.status !== 0) {
            throw new Error(
              `git ${args.join(' ')} failed: ${res.stdout}\n${res.stderr}`,
            )
          }
        }

        run(['init'])
        run(['config', 'user.email', 'test@example.com'])
        run(['config', 'user.name', 'Test User'])

        writeFileSync(join(repoDir, 'a.txt'), 'hello\n', 'utf8')
        run(['add', '.'])
        run(['commit', '-m', 'init'])

        run(['branch', 'test-branch'])

        const daemon = await startKodeDaemon({
          cwd: repoDir,
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
              const msg = JSON.parse(String(getWsMessageData(ev)))
              events.push(msg)
              if (
                msg?.type === 'permission_request' &&
                typeof msg.request_id === 'string'
              ) {
                ws.send(
                  JSON.stringify({
                    type: 'permission_response',
                    request_id: msg.request_id,
                    decision: 'allow_once',
                  }),
                )
              }
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

          ws.send(JSON.stringify({ type: 'git_branches' }))
          const branches = await waitForEvent(
            events,
            e => e && e.type === 'git_branches_result',
            10_000,
          )
          expect(Array.isArray(branches.branches)).toBe(true)
          expect(branches.branches.includes('test-branch')).toBe(true)

          ws.send(
            JSON.stringify({ type: 'git_checkout', branch: 'test-branch' }),
          )
          const checkout = await waitForEvent(
            events,
            e => e && e.type === 'git_checkout_result',
            10_000,
          )
          expect(checkout.ok).toBe(true)

          ws.send(JSON.stringify({ type: 'git_status' }))
          const onBranch = await waitForEvent(
            events,
            e =>
              e && e.type === 'git_status_result' && e.branch === 'test-branch',
            10_000,
          )
          expect(onBranch.isRepo).toBe(true)

          // Reset event buffer so subsequent assertions don't match earlier results.
          events.length = 0

          writeFileSync(join(repoDir, 'a.txt'), 'hello\nworld\n', 'utf8')

          ws.send(JSON.stringify({ type: 'git_status' }))
          const status1 = await waitForEvent(
            events,
            e =>
              e &&
              e.type === 'git_status_result' &&
              Array.isArray(e.entries) &&
              e.entries.some((x: any) => x?.path === 'a.txt'),
            10_000,
          )
          expect(status1.isRepo).toBe(true)
          expect(Array.isArray(status1.entries)).toBe(true)
          expect(status1.entries.some((x: any) => x?.path === 'a.txt')).toBe(
            true,
          )

          ws.send(
            JSON.stringify({ type: 'git_diff', path: 'a.txt', staged: false }),
          )
          const diff1 = await waitForEvent(
            events,
            e => e && e.type === 'git_diff_result',
            10_000,
          )
          expect(String(diff1.diff || '')).toContain('+world')

          ws.send(JSON.stringify({ type: 'git_stage', path: 'a.txt' }))
          const stage = await waitForEvent(
            events,
            e => e && e.type === 'git_action_result' && e.action === 'stage',
            10_000,
          )
          expect(stage.ok).toBe(true)

          ws.send(
            JSON.stringify({
              type: 'git_commit',
              message: 'test: commit from webui',
            }),
          )
          const commit = await waitForEvent(
            events,
            e => e && e.type === 'git_commit_result',
            20_000,
          )
          expect(commit.ok).toBe(true)

          ws.send(JSON.stringify({ type: 'git_status' }))
          const status2 = await waitForEvent(
            events,
            e =>
              e &&
              e.type === 'git_status_result' &&
              Array.isArray(e.entries) &&
              e.entries.length === 0,
            10_000,
          )
          expect(status2.isRepo).toBe(true)
          expect(Array.isArray(status2.entries)).toBe(true)
          expect(status2.entries.length).toBe(0)

          try {
            ws.close()
          } catch {}
        } finally {
          daemon.stop()
        }
      } finally {
        rmSync(repoDir, { recursive: true, force: true })
      }
    },
    30_000,
  )
})
