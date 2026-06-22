import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { readdir, readFile, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  cleanupExpiredAcpSessions,
  getAcpSessionDir,
  getAcpSessionFilePath,
  loadAcpSessionFromDisk,
  persistAcpSessionToDisk,
} from '#host-acp/sessionStore'
import { AcpSessionManager } from '#host-acp/sessionManager'
import { createDefaultToolPermissionContext } from '#core/types/toolPermissionContext'

describe('ACP session store', () => {
  const originalConfigDir = process.env.KODE_CONFIG_DIR
  let configDir = ''
  let projectDir = ''

  afterEach(() => {
    if (originalConfigDir === undefined) delete process.env.KODE_CONFIG_DIR
    else process.env.KODE_CONFIG_DIR = originalConfigDir
    if (configDir) rmSync(configDir, { recursive: true, force: true })
    if (projectDir) rmSync(projectDir, { recursive: true, force: true })
    configDir = ''
    projectDir = ''
  })

  test('persists atomically and loads the backward-compatible JSON shape', async () => {
    configDir = mkdtempSync(join(tmpdir(), 'kode-acp-store-config-'))
    projectDir = mkdtempSync(join(tmpdir(), 'kode-acp-store-project-'))
    process.env.KODE_CONFIG_DIR = configDir

    await persistAcpSessionToDisk({
      sessionId: 'sess_test',
      cwd: projectDir,
      mcpServers: [],
      messages: [],
      toolPermissionContext: createDefaultToolPermissionContext(),
      readFileTimestamps: {},
      responseState: {},
      currentModeId: 'default',
    })

    const path = getAcpSessionFilePath(projectDir, 'sess_test')
    expect(existsSync(path)).toBe(true)
    const files = await readdir(getAcpSessionDir(projectDir))
    expect(files.filter(file => file.endsWith('.tmp'))).toEqual([])

    const raw = JSON.parse(await readFile(path, 'utf8'))
    expect(raw.sessionId).toBe('sess_test')
    expect(raw.cwd).toBe(projectDir)
    expect(raw.version).toBe(1)

    const loaded = await loadAcpSessionFromDisk(projectDir, 'sess_test')
    expect(loaded?.sessionId).toBe('sess_test')
    expect(loaded?.currentModeId).toBe('default')
  })

  test('cleanup removes expired session files by mtime only', async () => {
    configDir = mkdtempSync(join(tmpdir(), 'kode-acp-clean-config-'))
    projectDir = mkdtempSync(join(tmpdir(), 'kode-acp-clean-project-'))
    process.env.KODE_CONFIG_DIR = configDir

    const oldPath = getAcpSessionFilePath(projectDir, 'old')
    const freshPath = getAcpSessionFilePath(projectDir, 'fresh')
    await persistAcpSessionToDisk({
      sessionId: 'old',
      cwd: projectDir,
      mcpServers: [],
      messages: [],
      toolPermissionContext: createDefaultToolPermissionContext(),
      readFileTimestamps: {},
      responseState: {},
      currentModeId: 'default',
    })
    await persistAcpSessionToDisk({
      sessionId: 'fresh',
      cwd: projectDir,
      mcpServers: [],
      messages: [],
      toolPermissionContext: createDefaultToolPermissionContext(),
      readFileTimestamps: {},
      responseState: {},
      currentModeId: 'default',
    })

    const oldDate = new Date(Date.now() - 10_000)
    await utimes(oldPath, oldDate, oldDate)
    await writeFile(join(getAcpSessionDir(projectDir), 'note.txt'), 'keep')

    await cleanupExpiredAcpSessions({
      cwd: projectDir,
      ttlMs: 1_000,
      nowMs: Date.now(),
    })

    expect(existsSync(oldPath)).toBe(false)
    expect(existsSync(freshPath)).toBe(true)
    expect(existsSync(join(getAcpSessionDir(projectDir), 'note.txt'))).toBe(
      true,
    )
  })
})

describe('ACP in-memory session manager', () => {
  test('evicts oldest sessions and closes only session-owned MCP clients', async () => {
    let now = 1
    const closed: string[] = []
    const aborted: string[] = []
    const manager = new AcpSessionManager<any>({
      maxSessions: 1,
      now: () => now,
    })

    const firstAbort = new AbortController()
    firstAbort.signal.addEventListener('abort', () => aborted.push('first'))

    await manager.set('first', {
      sessionId: 'first',
      activeAbortController: firstAbort,
      sessionOwnedMcpClients: [
        {
          type: 'connected',
          name: 'owned',
          capabilities: null,
          client: { close: async () => closed.push('owned') },
        },
      ],
    })

    now += 1
    await manager.set('second', {
      sessionId: 'second',
      activeAbortController: null,
      sessionOwnedMcpClients: [
        {
          type: 'connected',
          name: 'second-owned',
          capabilities: null,
          client: { close: async () => closed.push('second-owned') },
        },
      ],
    })

    expect(manager.get('first')).toBeUndefined()
    expect(manager.get('second')?.sessionId).toBe('second')
    expect(aborted).toEqual(['first'])
    expect(closed).toEqual(['owned'])
  })
})
