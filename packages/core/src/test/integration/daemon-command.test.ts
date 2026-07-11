import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { DaemonRegistry } from '#cli-services/daemonRegistry'

function daemonEnv(configDir: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    KODE_CONFIG_DIR: configDir,
  }
  delete env.CI
  return env
}

function runDaemon(args: string[], env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, ['apps/cli/src/dispatch.ts', ...args], {
    cwd: process.cwd(),
    env,
    encoding: 'utf8',
    timeout: 10_000,
  })
}

describe('kode daemon command', () => {
  test('status is non-interactive, scriptable, and honors global --cwd', () => {
    const configDir = mkdtempSync(join(tmpdir(), 'kode-daemon-command-'))
    const workspace = mkdtempSync(join(tmpdir(), 'kode-daemon-workspace-'))

    try {
      const result = runDaemon(
        ['--cwd', workspace, 'daemon', 'status', '--json'],
        daemonEnv(configDir),
      )

      expect(result.error).toBeUndefined()
      expect(result.status).toBe(3)
      expect(JSON.parse(String(result.stdout))).toEqual({
        state: 'missing',
        workspacePath: resolve(workspace),
        availableActions: ['start'],
      })
    } finally {
      rmSync(configDir, { recursive: true, force: true })
      rmSync(workspace, { recursive: true, force: true })
    }
  }, 15_000)

  test('status never serializes a registry token', () => {
    const configDir = mkdtempSync(join(tmpdir(), 'kode-daemon-command-'))
    const workspace = mkdtempSync(join(tmpdir(), 'kode-daemon-workspace-'))
    const secret = 'daemon-registry-token-must-not-print'

    try {
      const registry = new DaemonRegistry({
        registryPath: join(configDir, 'daemon', 'registry.v1.json'),
      })
      registry.upsert({
        workspacePath: workspace,
        pid: process.pid,
        url: 'http://127.0.0.1:1/',
        token: secret,
        versionSignature: 'test',
      })

      const result = runDaemon(
        ['daemon', 'status', '--cwd', workspace, '--json'],
        daemonEnv(configDir),
      )

      expect(result.error).toBeUndefined()
      expect(result.status).toBe(5)
      expect(`${result.stdout}${result.stderr}`).not.toContain(secret)
      expect(JSON.parse(String(result.stdout))).toMatchObject({
        state: 'unhealthy',
        workspacePath: resolve(workspace),
        url: 'http://127.0.0.1:1/',
      })
    } finally {
      rmSync(configDir, { recursive: true, force: true })
      rmSync(workspace, { recursive: true, force: true })
    }
  }, 15_000)

  test('stop removes a stale record even when its workspace was deleted', () => {
    const configDir = mkdtempSync(join(tmpdir(), 'kode-daemon-command-'))
    const workspace = join(configDir, 'deleted-workspace')

    try {
      mkdirSync(workspace)
      const registry = new DaemonRegistry({
        registryPath: join(configDir, 'daemon', 'registry.v1.json'),
      })
      registry.upsert({
        workspacePath: workspace,
        pid: 999_999_999,
        url: 'http://127.0.0.1:4242/',
        token: 'stale-token',
        versionSignature: 'test',
      })
      rmSync(workspace, { recursive: true, force: true })

      const result = runDaemon(
        ['daemon', 'stop', '--cwd', workspace],
        daemonEnv(configDir),
      )

      expect(result.error).toBeUndefined()
      expect(result.status).toBe(0)
      expect(String(result.stdout)).toContain(
        'Removed stale daemon registry record.',
      )
      expect(registry.lookup(workspace)).toEqual({ state: 'missing' })
    } finally {
      rmSync(configDir, { recursive: true, force: true })
    }
  }, 15_000)

  test('starts, probes, and stops a source daemon without printing its token', () => {
    const configDir = mkdtempSync(join(tmpdir(), 'kode-daemon-command-'))
    const workspace = mkdtempSync(join(tmpdir(), 'kode-daemon-workspace-'))
    const env = daemonEnv(configDir)
    let started = false

    try {
      const start = runDaemon(
        [
          'daemon',
          'start',
          '--cwd',
          workspace,
          '--version-signature',
          'integration-test',
        ],
        env,
      )

      expect(start.error).toBeUndefined()
      expect(start.status).toBe(0)
      started = true

      const registry = new DaemonRegistry({
        registryPath: join(configDir, 'daemon', 'registry.v1.json'),
      })
      const lookup = registry.lookup(workspace)
      expect(lookup.state).toBe('live')
      if (lookup.state !== 'live') {
        throw new Error(`Expected a live daemon, received ${lookup.state}.`)
      }
      expect(`${start.stdout}${start.stderr}`).not.toContain(lookup.entry.token)
      expect(`${start.stdout}${start.stderr}`).not.toContain('token=')
      expect(String(start.stdout)).toContain(lookup.entry.url)

      const status = runDaemon(
        ['daemon', 'status', '--cwd', workspace, '--json'],
        env,
      )
      expect(status.error).toBeUndefined()
      expect(status.status).toBe(0)
      expect(JSON.parse(String(status.stdout))).toMatchObject({
        state: 'live',
        url: lookup.entry.url,
      })

      const stop = runDaemon(['daemon', 'stop', '--cwd', workspace], env)
      expect(stop.error).toBeUndefined()
      expect(stop.status).toBe(0)
      expect(String(stop.stdout)).toContain('Stopped daemon')
      started = false
    } finally {
      if (started) {
        runDaemon(['daemon', 'stop', '--cwd', workspace, '--force'], env)
      }
      rmSync(configDir, { recursive: true, force: true })
      rmSync(workspace, { recursive: true, force: true })
    }
  }, 30_000)
})
