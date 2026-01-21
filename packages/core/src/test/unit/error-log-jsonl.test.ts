import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('error log jsonl parity', () => {
  const originalKodeConfigDir = process.env.KODE_CONFIG_DIR
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'kode-errors-jsonl-'))
    process.env.KODE_CONFIG_DIR = tempDir
  })

  afterEach(() => {
    if (originalKodeConfigDir === undefined) {
      delete process.env.KODE_CONFIG_DIR
    } else {
      process.env.KODE_CONFIG_DIR = originalKodeConfigDir
    }
    rmSync(tempDir, { recursive: true, force: true })
  })

  test('logError appends newline-delimited JSON objects', async () => {
    const { logError, getErrorsLog } = await import('#core/logging/log/errors')
    const { getErrorsPath } = await import('#core/logging/log/paths')

    const path = getErrorsPath()
    expect(path.endsWith('.jsonl')).toBe(true)
    expect(existsSync(path)).toBe(false)

    logError(new Error('boom'))
    logError('oops')

    expect(existsSync(path)).toBe(true)

    const content = readFileSync(path, 'utf8')
    const lines = content.trim().split('\n')
    expect(lines.length).toBeGreaterThanOrEqual(2)

    for (const line of lines) {
      const parsed = JSON.parse(line) as Record<string, unknown>
      expect(typeof parsed).toBe('object')
      expect(typeof parsed.sessionId).toBe('string')
      expect(typeof parsed.timestamp).toBe('string')
      expect(typeof parsed.cwd).toBe('string')
    }

    const logEntries = getErrorsLog()
    expect(logEntries.length).toBeGreaterThanOrEqual(2)
  })
})
