import { afterEach, describe, expect, test } from 'bun:test'
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  DAEMON_REGISTRY_SCHEMA_VERSION,
  DaemonRegistry,
  normalizeDaemonWorkspaceKey,
} from './daemonRegistry'

const temporaryDirectories: string[] = []

function createRegistry(
  options: {
    now?: number
    alive?: (pid: number) => boolean
    platform?: NodeJS.Platform
  } = {},
) {
  const root = mkdtempSync(join(tmpdir(), 'kode-daemon-registry-'))
  temporaryDirectories.push(root)
  return {
    root,
    registry: new DaemonRegistry({
      registryPath: join(root, 'registry.v1.json'),
      now: () => options.now ?? 1_700_000_000_000,
      isProcessAlive: options.alive ?? (() => true),
      platform: options.platform,
    }),
  }
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('DaemonRegistry', () => {
  test('normalizes Windows workspace keys without case or separator drift', () => {
    expect(normalizeDaemonWorkspaceKey('C:\\Code\\Repo\\', 'win32')).toBe(
      'c:/code/repo',
    )
    expect(normalizeDaemonWorkspaceKey('C:/CODE/repo', 'win32')).toBe(
      'c:/code/repo',
    )
  })

  test('persists an owner-only, versioned record atomically', () => {
    const { root, registry } = createRegistry()
    const entry = registry.upsert({
      workspacePath: join(root, 'workspace'),
      pid: 4242,
      url: 'http://127.0.0.1:4242',
      token: 'local-secret-token',
      versionSignature: '2.2.1+abc123',
    })

    expect(entry.schemaVersion).toBe(DAEMON_REGISTRY_SCHEMA_VERSION)
    expect(registry.lookup(join(root, 'workspace'))).toEqual({
      state: 'live',
      entry,
    })
    expect(readdirSync(root).some(name => name.includes('.tmp.'))).toBe(false)

    const persisted = JSON.parse(readFileSync(registry.path, 'utf8'))
    expect(persisted.schemaVersion).toBe(DAEMON_REGISTRY_SCHEMA_VERSION)
    expect(persisted.entries[entry.workspaceKey].token).toBe(
      'local-secret-token',
    )
    if (process.platform !== 'win32') {
      expect(statSync(registry.path).mode & 0o777).toBe(0o600)
    }
  })

  test('reports stale PIDs without deleting a recoverable record', () => {
    const { root, registry } = createRegistry({ alive: () => false })
    const entry = registry.upsert({
      workspacePath: join(root, 'workspace'),
      pid: 4242,
      url: 'http://127.0.0.1:4242',
      token: 'local-secret-token',
      versionSignature: '2.2.1+abc123',
      startedAt: 123,
    })

    expect(registry.lookup(join(root, 'workspace'))).toEqual({
      state: 'stale',
      entry,
    })
    expect(existsSync(registry.path)).toBe(true)
  })

  test('keeps unrelated workspace records when removing a stale entry', () => {
    const { root, registry } = createRegistry()
    const first = join(root, 'first')
    const second = join(root, 'second')
    registry.upsert({
      workspacePath: first,
      pid: 111,
      url: 'http://127.0.0.1:111',
      token: 'first-token',
      versionSignature: 'v1',
    })
    registry.upsert({
      workspacePath: second,
      pid: 222,
      url: 'http://127.0.0.1:222',
      token: 'second-token',
      versionSignature: 'v1',
    })

    expect(registry.remove(first)).toBe(true)
    expect(registry.lookup(first)).toEqual({ state: 'missing' })
    expect(registry.lookup(second).state).toBe('live')
    expect(registry.remove(first)).toBe(false)
  })

  test('fails closed on corrupt registry contents', () => {
    const { root, registry } = createRegistry()
    writeFileSync(registry.path, '{not json}', 'utf8')

    expect(registry.lookup(join(root, 'workspace'))).toEqual({
      state: 'corrupt',
    })
    expect(() =>
      registry.upsert({
        workspacePath: join(root, 'workspace'),
        pid: 4242,
        url: 'http://127.0.0.1:4242',
        token: 'local-secret-token',
        versionSignature: 'v1',
      }),
    ).toThrow('Daemon registry is corrupt')
    expect(readFileSync(registry.path, 'utf8')).toBe('{not json}')
  })

  test('rejects entries whose key does not match their canonical workspace', () => {
    const { registry } = createRegistry({ platform: 'win32' })
    writeFileSync(
      registry.path,
      JSON.stringify({
        schemaVersion: DAEMON_REGISTRY_SCHEMA_VERSION,
        entries: {
          'c:/wrong': {
            schemaVersion: DAEMON_REGISTRY_SCHEMA_VERSION,
            workspaceKey: 'c:/wrong',
            workspacePath: 'C:\\Actual\\Workspace',
            pid: 4242,
            url: 'http://127.0.0.1:4242',
            token: 'local-secret-token',
            versionSignature: 'v1',
            startedAt: 1,
            updatedAt: 1,
          },
        },
      }),
      'utf8',
    )

    expect(registry.lookup('C:\\Actual\\Workspace')).toEqual({
      state: 'corrupt',
    })
  })

  test('rejects invalid process and endpoint metadata before writing', () => {
    const { root, registry } = createRegistry()

    expect(() =>
      registry.upsert({
        workspacePath: join(root, 'workspace'),
        pid: 0,
        url: 'ftp://127.0.0.1:4242',
        token: '',
        versionSignature: '',
      }),
    ).toThrow('Daemon pid must be a positive integer')
    expect(existsSync(registry.path)).toBe(false)
  })
})
