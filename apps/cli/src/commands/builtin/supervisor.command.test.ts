import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createTask, updateTaskWithDependencies } from '#core/tasks'

import supervisor, { parsePlanArgs } from './supervisor'

describe('/supervisor command', () => {
  const originalConfigDir = process.env.KODE_CONFIG_DIR
  const originalTaskListId = process.env.KODE_TASK_LIST_ID
  let rootDir: string

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'kode-supervisor-command-'))
    process.env.KODE_CONFIG_DIR = rootDir
    process.env.KODE_TASK_LIST_ID = 'supervisor-command-test'
  })

  afterEach(() => {
    if (originalConfigDir === undefined) delete process.env.KODE_CONFIG_DIR
    else process.env.KODE_CONFIG_DIR = originalConfigDir
    if (originalTaskListId === undefined) delete process.env.KODE_TASK_LIST_ID
    else process.env.KODE_TASK_LIST_ID = originalTaskListId
    rmSync(rootDir, { recursive: true, force: true })
  })

  test('shows graph readiness and persists a bounded parallel plan', async () => {
    const first = createTask({ subject: 'First', description: 'First' })
    const second = createTask({ subject: 'Second', description: 'Second' })
    expect(
      updateTaskWithDependencies({
        taskId: first.id,
        update: {},
        addBlocks: [second.id],
      }).ok,
    ).toBe(true)

    expect(await supervisor.call('status')).toContain(`Ready: ${first.id}`)
    const plan = await supervisor.call('plan parallel --max 2')
    expect(plan).toContain('Status: planned')
    expect(plan).toContain(`[${first.id}] -> [${second.id}]`)
    expect(await supervisor.call('list')).toContain('parallel')
  })

  test('parses safe plan arguments', () => {
    expect(parsePlanArgs('serial --max 1')).toEqual({
      strategy: 'serial',
      maxParallelism: 1,
    })
    expect(parsePlanArgs('--max 0')).toHaveProperty('error')
    expect(parsePlanArgs('parallel --evil')).toHaveProperty('error')
  })
})
