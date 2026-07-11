import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('kode daemon command', () => {
  test('status is non-interactive and does not start a daemon', () => {
    const configDir = mkdtempSync(join(tmpdir(), 'kode-daemon-command-'))
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      KODE_CONFIG_DIR: configDir,
    }
    delete env.CI

    try {
      const result = spawnSync(
        process.execPath,
        [
          'apps/cli/src/dispatch.ts',
          'daemon',
          'status',
          '--cwd',
          process.cwd(),
        ],
        {
          cwd: process.cwd(),
          env,
          encoding: 'utf8',
          timeout: 10_000,
        },
      )

      expect(result.error).toBeUndefined()
      expect(result.status).toBe(0)
      expect(String(result.stdout)).toContain('Daemon: missing')
    } finally {
      rmSync(configDir, { recursive: true, force: true })
    }
  }, 15_000)
})
