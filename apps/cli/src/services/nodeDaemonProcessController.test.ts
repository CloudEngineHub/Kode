import { describe, expect, test } from 'bun:test'
import { join, resolve } from 'node:path'

import {
  createNodeDaemonProcessController,
  daemonEntrypointWorkingDirectory,
  parseDaemonReadyUrl,
  redactDaemonUrl,
  resolveDaemonEntrypoint,
} from './nodeDaemonProcessController'

describe('node daemon process controller', () => {
  test('prefers a compiled daemon entrypoint when a package contains one', () => {
    const packageRoot = resolve('kode-package')
    const compiled = join(packageRoot, 'dist', 'entrypoints', 'daemon.js')
    const source = join(
      packageRoot,
      'apps',
      'cli',
      'src',
      'entrypoints',
      'daemon.ts',
    )
    const entrypoint = resolveDaemonEntrypoint({
      packageRoot,
      exists: path => path === compiled || path === source,
      isBunRuntime: false,
    })

    expect(entrypoint).toEqual({ path: compiled, kind: 'compiled' })
  })

  test('uses the source daemon when a source CLI is the invoker', () => {
    const packageRoot = resolve('kode-package')
    const compiled = join(packageRoot, 'dist', 'entrypoints', 'daemon.js')
    const source = join(
      packageRoot,
      'apps',
      'cli',
      'src',
      'entrypoints',
      'daemon.ts',
    )
    const invocationPath = join(
      packageRoot,
      'apps',
      'cli',
      'src',
      'dispatch.ts',
    )

    expect(
      resolveDaemonEntrypoint({
        invocationPath,
        exists: path => path === compiled || path === source,
        isBunRuntime: true,
      }),
    ).toEqual({ path: source, kind: 'source' })
  })

  test('permits a source entrypoint only when Bun owns the runtime', () => {
    const packageRoot = resolve('kode-package')
    const source = join(
      packageRoot,
      'apps',
      'cli',
      'src',
      'entrypoints',
      'daemon.ts',
    )

    expect(() =>
      resolveDaemonEntrypoint({
        packageRoot,
        exists: path => path === source,
        isBunRuntime: false,
      }),
    ).toThrow('requires Bun')

    expect(
      resolveDaemonEntrypoint({
        packageRoot,
        exists: path => path === source,
        isBunRuntime: true,
      }),
    ).toEqual({ path: source, kind: 'source' })
  })

  test('walks above the nested CLI package to find the source daemon entrypoint', () => {
    const packageRoot = resolve('kode-package')
    const source = join(
      packageRoot,
      'apps',
      'cli',
      'src',
      'entrypoints',
      'daemon.ts',
    )
    const invocationPath = join(
      packageRoot,
      'apps',
      'cli',
      'src',
      'dispatch.ts',
    )

    expect(
      resolveDaemonEntrypoint({
        invocationPath,
        exists: path => path === source,
        isBunRuntime: true,
      }),
    ).toEqual({ path: source, kind: 'source' })
    expect(
      daemonEntrypointWorkingDirectory({ path: source, kind: 'source' }),
    ).toBe(packageRoot)
  })

  test('uses the package root for a compiled daemon entrypoint', () => {
    const packageRoot = resolve('kode-package')
    const compiled = join(packageRoot, 'dist', 'entrypoints', 'daemon.js')

    expect(
      daemonEntrypointWorkingDirectory({ path: compiled, kind: 'compiled' }),
    ).toBe(packageRoot)
  })

  test('does not persist a daemon token in the registry URL', () => {
    expect(
      redactDaemonUrl('http://localhost:4321/?token=top-secret&mode=local'),
    ).toBe('http://localhost:4321/?mode=local')
  })

  test('accepts only an explicit token-free loopback readiness record', () => {
    expect(
      parseDaemonReadyUrl(
        'KODE_DAEMON_READY {"type":"kode-daemon-ready","url":"http://127.0.0.1:4321/"}',
      ),
    ).toBe('http://127.0.0.1:4321/')

    expect(parseDaemonReadyUrl('https://attacker.example/')).toBeNull()
    expect(
      parseDaemonReadyUrl(
        'KODE_DAEMON_READY {"type":"kode-daemon-ready","url":"https://attacker.example/"}',
      ),
    ).toBeNull()
    expect(
      parseDaemonReadyUrl(
        'KODE_DAEMON_READY {"type":"kode-daemon-ready","url":"http://127.0.0.1:4321/?token=leak"}',
      ),
    ).toBeNull()
  })

  test('does not send a bearer token to an untrusted health endpoint', async () => {
    let fetchCalls = 0
    const controller = createNodeDaemonProcessController({
      daemonEntrypoint: process.execPath,
      fetchImpl: (async () => {
        fetchCalls += 1
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }) as unknown as typeof fetch,
    })

    await expect(
      controller.probe({
        url: 'https://attacker.example/',
        token: 'never-send-this-token',
      }),
    ).resolves.toBe(false)
    expect(fetchCalls).toBe(0)
  })
})
