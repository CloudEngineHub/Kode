import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import memory from './memory'
import { getCwd, setCwd } from '#core/utils/state'

describe('/memory command', () => {
  let root: string
  let projectDir: string
  let previousConfigDir: string | undefined
  let previousCwd: string

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'kode-memory-command-root-'))
    projectDir = mkdtempSync(join(tmpdir(), 'kode-memory-command-project-'))
    previousConfigDir = process.env.KODE_CONFIG_DIR
    previousCwd = getCwd()
    process.env.KODE_CONFIG_DIR = root
    await setCwd(projectDir)
  })

  afterEach(async () => {
    await setCwd(previousCwd)
    if (previousConfigDir === undefined) delete process.env.KODE_CONFIG_DIR
    else process.env.KODE_CONFIG_DIR = previousConfigDir
    rmSync(root, { recursive: true, force: true })
    rmSync(projectDir, { recursive: true, force: true })
  })

  test('remembers, lists, searches, and forgets project-scoped facts', async () => {
    const saved = await memory.call(
      'remember Use Bun for Kode package scripts.',
    )
    expect(saved).toContain('Remembered')
    const id = saved.match(/Remembered ([a-f0-9-]+):/u)?.[1]
    expect(id).toBeTruthy()

    expect(await memory.call('list')).toContain(
      'Use Bun for Kode package scripts.',
    )
    expect(await memory.call('search package scripts')).toContain('relevance')
    expect(await memory.call(`forget ${id}`)).toContain('Forgot memory')
    expect(await memory.call('list')).toContain('No memories found')
  })

  test('returns bounded help for invalid input without creating a memory', async () => {
    const output = await memory.call('list 21')
    expect(output).toContain('List limit must be an integer from 1 to 20')
    expect(output).toContain('/memory remember')
    expect(await memory.call('list')).toContain('No memories found')
  })
})
