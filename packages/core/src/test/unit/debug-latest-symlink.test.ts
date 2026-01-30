import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readlinkSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('debug/latest symlink parity (Claude-compatible)', () => {
  const originalKodeConfigDir = process.env.KODE_CONFIG_DIR
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'kode-debug-latest-'))
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

  test('DEBUG_PATHS.latest() returns path ending with latest', async () => {
    const transportModule = await import('#core/logging/transports')
    const latestPath = transportModule.DEBUG_PATHS.latest()
    expect(latestPath.endsWith('latest')).toBe(true)
  })

  test('ensureDebugDir creates debug directory when debug mode enabled', async () => {
    process.env.KODE_DEBUG = '1'

    const { DEBUG_PATHS, ensureDebugDir } =
      await import('#core/logging/transports')
    const debugBase = DEBUG_PATHS.base()

    expect(existsSync(debugBase)).toBe(false)
    ensureDebugDir()
    expect(existsSync(debugBase)).toBe(true)

    delete process.env.KODE_DEBUG
  })

  test('latest symlink points to detailed log when ensureDebugDir called', async () => {
    process.env.KODE_DEBUG = '1'

    const { DEBUG_PATHS, ensureDebugDir } =
      await import('#core/logging/transports')
    ensureDebugDir()

    const latestPath = DEBUG_PATHS.latest()
    const detailedPath = DEBUG_PATHS.detailed()

    if (existsSync(latestPath)) {
      const stat = lstatSync(latestPath)
      expect(stat.isSymbolicLink()).toBe(true)

      const target = readlinkSync(latestPath)
      expect(target).toBe(detailedPath)
    }

    delete process.env.KODE_DEBUG
  })

  test('DEBUG_PATHS.detailed() defaults to debug/<sessionId>.txt', async () => {
    process.env.KODE_DEBUG = '1'

    const { setKodeAgentSessionId } =
      await import('#protocol/utils/kodeAgentSessionId')
    setKodeAgentSessionId('test-session-id')

    const { DEBUG_PATHS, ensureDebugDir } =
      await import('#core/logging/transports')
    ensureDebugDir()

    const debugBase = DEBUG_PATHS.base()
    const detailedPath = DEBUG_PATHS.detailed()

    expect(detailedPath).toBe(join(debugBase, 'test-session-id.txt'))

    delete process.env.KODE_DEBUG
  })

  test('CLAUDE_CODE_DEBUG_LOGS_DIR overrides DEBUG_PATHS.detailed()', async () => {
    process.env.KODE_DEBUG = '1'

    const overrideDir = join(tempDir, 'override-debug-dir')
    const overrideFile = join(overrideDir, 'debug.txt')
    process.env.CLAUDE_CODE_DEBUG_LOGS_DIR = overrideFile

    const { DEBUG_PATHS, ensureDebugDir } =
      await import('#core/logging/transports')
    ensureDebugDir()

    expect(DEBUG_PATHS.detailed()).toBe(overrideFile)
    expect(existsSync(overrideDir)).toBe(true)

    delete process.env.CLAUDE_CODE_DEBUG_LOGS_DIR
    delete process.env.KODE_DEBUG
  })
})
