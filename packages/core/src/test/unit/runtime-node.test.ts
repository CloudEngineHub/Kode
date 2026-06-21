import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'

import { createNodeRuntime } from '#runtime/node'

describe('runtime-node', () => {
  const runtime = createNodeRuntime({
    log: { debug() {}, info() {}, warn() {}, error() {} },
  })

  test('fs: read/write/stat/readdir/realpath/rm', async () => {
    const base = join(tmpdir(), 'kode-runtime-node-test', randomUUID())
    await runtime.fs.mkdir(base, { recursive: true })

    const file = join(base, 'a.txt')
    await runtime.fs.writeFile(file, 'hello')

    expect(await runtime.fs.exists(file)).toBe(true)
    expect(await runtime.fs.readFile(file, 'utf8')).toBe('hello')

    const bytes = await runtime.fs.readFileBytes(file)
    expect(new TextDecoder().decode(bytes)).toBe('hello')

    const s = await runtime.fs.stat(file)
    expect(s.isFile).toBe(true)
    expect(s.isDirectory).toBe(false)
    expect(s.size).toBe(5)

    const entries = await runtime.fs.readdir(base)
    expect(entries).toContain('a.txt')

    const rp = await runtime.fs.realpath(file)
    expect(typeof rp).toBe('string')
    expect(rp.length).toBeGreaterThan(0)

    await runtime.fs.rm(base, { recursive: true, force: true })
    expect(await runtime.fs.exists(file)).toBe(false)
  })

  test('process.spawn: captures stdout/stderr when piped', async () => {
    const proc = runtime.process.spawn({
      cmd: [
        process.execPath,
        '-e',
        'console.log("hello"); console.error("err")',
      ],
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const res = await proc.exited
    expect(res.exitCode).toBe(0)
    expect(res.stdout ?? '').toContain('hello')
    expect(res.stderr ?? '').toContain('err')
  })

  test('clock.sleep: supports abort', async () => {
    const controller = new AbortController()
    const p = runtime.clock.sleep(10_000, controller.signal)
    controller.abort('stop')

    try {
      await p
      throw new Error('Expected sleep to abort')
    } catch (e: any) {
      expect(e?.name).toBe('AbortError')
    }
  })
})
