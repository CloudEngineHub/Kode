import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { clearContextCache, getReadme } from '#core/context'
import { setCwd } from '#core/utils/state'

describe('clearContextCache', () => {
  const runnerCwd = process.cwd()

  let dir1: string
  let dir2: string

  beforeEach(async () => {
    dir1 = mkdtempSync(join(tmpdir(), 'kode-context-cache-1-'))
    dir2 = mkdtempSync(join(tmpdir(), 'kode-context-cache-2-'))
    writeFileSync(join(dir1, 'README.md'), 'one', 'utf8')
    writeFileSync(join(dir2, 'README.md'), 'two', 'utf8')

    clearContextCache()
    await setCwd(dir1)
  })

  afterEach(async () => {
    clearContextCache()
    await setCwd(runnerCwd)
    rmSync(dir1, { recursive: true, force: true })
    rmSync(dir2, { recursive: true, force: true })
  })

  test('clears memoized readme across cwd changes', async () => {
    const r1 = await getReadme()
    expect(r1).toBe('one')

    await setCwd(dir2)
    const cached = await getReadme()
    expect(cached).toBe('one')

    clearContextCache()
    const r2 = await getReadme()
    expect(r2).toBe('two')
  })
})
