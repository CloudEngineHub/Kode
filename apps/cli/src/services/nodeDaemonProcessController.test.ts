import { describe, expect, test } from 'bun:test'
import { join, resolve } from 'node:path'

import {
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

  test('does not persist a daemon token in the registry URL', () => {
    expect(
      redactDaemonUrl('http://localhost:4321/?token=top-secret&mode=local'),
    ).toBe('http://localhost:4321/?mode=local')
  })
})
