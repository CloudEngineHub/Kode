import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  __setTaskStorageWriteHookForTests,
  createTask,
  getTask,
  getTaskListDir,
  updateTaskWithDependencies,
} from '#core/utils/taskStorage'
import { TaskUpdateTool } from '#tools/tools/interaction/TaskUpdateTool/TaskUpdateTool'

const ENV_KEYS = [
  'HOME',
  'KODE_CONFIG_DIR',
  'CLAUDE_CONFIG_DIR',
  'KODE_TASK_LIST_ID',
] as const

describe('task dependency transactions', () => {
  let tempRoot: string
  let previousEnv: Record<(typeof ENV_KEYS)[number], string | undefined>

  beforeEach(() => {
    previousEnv = Object.fromEntries(
      ENV_KEYS.map(key => [key, process.env[key]]),
    ) as Record<(typeof ENV_KEYS)[number], string | undefined>

    tempRoot = mkdtempSync(join(tmpdir(), 'kode-task-dependency-'))
    process.env.HOME = join(tempRoot, 'home')
    process.env.KODE_CONFIG_DIR = join(tempRoot, 'kode')
    process.env.CLAUDE_CONFIG_DIR = join(tempRoot, 'claude')
    process.env.KODE_TASK_LIST_ID = 'dependency-transaction-test'
  })

  afterEach(() => {
    __setTaskStorageWriteHookForTests(null)
    for (const key of ENV_KEYS) {
      const previous = previousEnv[key]
      if (previous === undefined) delete process.env[key]
      else process.env[key] = previous
    }
    rmSync(tempRoot, { recursive: true, force: true })
  })

  test('commits task fields and both dependency edges together', () => {
    const first = createTask({ subject: 'First', description: 'First task' })
    const second = createTask({ subject: 'Second', description: 'Second task' })

    const result = updateTaskWithDependencies({
      taskId: first.id,
      update: { status: 'in_progress' },
      addBlocks: [second.id],
    })

    expect(result.ok).toBe(true)
    if (result.ok === false) throw new Error(result.error)
    expect(result.addedBlocks).toEqual([second.id])
    expect(getTask(first.id)).toMatchObject({
      status: 'in_progress',
      blocks: [second.id],
    })
    expect(getTask(second.id)?.blockedBy).toEqual([first.id])
  })

  test('rejects cycles without committing any part of the update', () => {
    const first = createTask({ subject: 'First', description: 'First task' })
    const second = createTask({ subject: 'Second', description: 'Second task' })
    const third = createTask({ subject: 'Third', description: 'Third task' })

    expect(
      updateTaskWithDependencies({
        taskId: first.id,
        update: {},
        addBlocks: [second.id],
      }).ok,
    ).toBe(true)
    expect(
      updateTaskWithDependencies({
        taskId: second.id,
        update: {},
        addBlocks: [third.id],
      }).ok,
    ).toBe(true)

    const result = updateTaskWithDependencies({
      taskId: third.id,
      update: { subject: 'Should not persist' },
      addBlocks: [first.id],
    })

    expect(result.ok).toBe(false)
    if (result.ok === true) throw new Error('Expected cycle rejection')
    expect(result.error).toContain('would create a cycle')
    expect(getTask(third.id)?.subject).toBe('Third')
    expect(getTask(third.id)?.blocks).toEqual([])
    expect(getTask(first.id)?.blockedBy).toEqual([])
  })

  test('does not adopt legacy dependencies before all validation succeeds', () => {
    const first = createTask({ subject: 'First', description: 'First task' })
    const legacyId = '2'
    const legacyDir = join(
      process.env.CLAUDE_CONFIG_DIR!,
      'tasks',
      process.env.KODE_TASK_LIST_ID!,
    )
    mkdirSync(legacyDir, { recursive: true })
    writeFileSync(
      join(legacyDir, `${legacyId}.json`),
      JSON.stringify({
        id: legacyId,
        subject: 'Legacy dependency',
        description: 'Stored outside the primary task store',
        status: 'pending',
        blocks: [],
        blockedBy: [],
      }),
      'utf8',
    )

    const result = updateTaskWithDependencies({
      taskId: first.id,
      update: { subject: 'Should not persist' },
      addBlocks: [legacyId, '999'],
    })

    expect(result.ok).toBe(false)
    expect(getTask(first.id)?.subject).toBe('First')
    expect(getTask(first.id)?.blocks).toEqual([])
    expect(
      existsSync(
        join(
          getTaskListDir(process.env.KODE_TASK_LIST_ID!),
          `${legacyId}.json`,
        ),
      ),
    ).toBe(false)
  })

  test('rolls back both edges and reports TaskUpdate failure when a later write fails', async () => {
    const first = createTask({ subject: 'First', description: 'First task' })
    const second = createTask({ subject: 'Second', description: 'Second task' })
    let writeCount = 0
    let output: any = null

    __setTaskStorageWriteHookForTests(() => {
      writeCount += 1
      if (writeCount === 2) throw new Error('injected dependency write failure')
    })

    for await (const chunk of TaskUpdateTool.call({
      taskId: first.id,
      status: 'in_progress',
      addBlocks: [second.id],
    })) {
      if (chunk.type === 'result') output = chunk.data
    }
    __setTaskStorageWriteHookForTests(null)

    expect(output.success).toBe(false)
    expect(output.error).toContain('injected dependency write failure')
    expect(TaskUpdateTool.renderToolResultMessage(output)).toContain(
      'update failed',
    )
    expect(TaskUpdateTool.renderResultForAssistant(output)).toBe(output.error)
    expect(getTask(first.id)).toMatchObject({ status: 'pending', blocks: [] })
    expect(getTask(second.id)?.blockedBy).toEqual([])
  })

  test('TaskUpdate reports dependency failures and leaves scalar fields unchanged', async () => {
    const first = createTask({ subject: 'First', description: 'First task' })
    let output: any = null

    for await (const chunk of TaskUpdateTool.call({
      taskId: first.id,
      subject: 'Should not persist',
      addBlocks: ['999'],
    })) {
      if (chunk.type === 'result') output = chunk.data
    }

    expect(output).toMatchObject({
      success: false,
      taskId: first.id,
      updatedFields: [],
    })
    expect(output.error).toContain('Task not found: 999')
    expect(getTask(first.id)?.subject).toBe('First')
  })
})
