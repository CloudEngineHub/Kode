import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { Box, render } from 'ink'
import React from 'react'
import { PassThrough } from 'stream'
import stripAnsi from 'strip-ansi'
import { WorkTasksViewForTests } from '#cli-commands/builtin/work'
import { createTask, updateTask } from '#core/utils/taskStorage'
import { KeypressProvider } from '#ui-ink/contexts/KeypressContext'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function renderToText(element: React.ReactElement): Promise<string> {
  const stdin = new PassThrough() as PassThrough & {
    isTTY?: boolean
    isRaw?: boolean
    setRawMode?: (enabled: boolean) => void
  }
  stdin.isTTY = true
  stdin.isRaw = true
  stdin.setRawMode = () => {}
  stdin.setEncoding('utf8')
  stdin.resume()

  const stdout = new PassThrough() as PassThrough & {
    isTTY?: boolean
    columns?: number
    rows?: number
  }
  stdout.isTTY = true
  stdout.columns = 100
  stdout.rows = 30

  let rawOutput = ''
  stdout.on('data', chunk => {
    rawOutput += chunk.toString('utf8')
  })

  const instance = render(
    <KeypressProvider>
      <Box>{element}</Box>
    </KeypressProvider>,
    {
      stdin: stdin as unknown as NodeJS.ReadStream,
      stdout: stdout as unknown as NodeJS.WriteStream,
      exitOnCtrlC: false,
    },
  )

  await new Promise(resolve => setTimeout(resolve, 0))
  instance.unmount()

  return stripAnsi(rawOutput)
}

describe('/work command (task list overlay)', () => {
  let tmpRoot: string
  let previousConfigDir: string | undefined
  let previousTaskListId: string | undefined

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'kode-work-tasks-'))
    previousConfigDir = process.env.KODE_CONFIG_DIR
    previousTaskListId = process.env.KODE_TASK_LIST_ID
    process.env.KODE_CONFIG_DIR = tmpRoot
    process.env.KODE_TASK_LIST_ID = 'test-task-list'
  })

  afterEach(() => {
    if (previousConfigDir === undefined) delete process.env.KODE_CONFIG_DIR
    else process.env.KODE_CONFIG_DIR = previousConfigDir

    if (previousTaskListId === undefined) delete process.env.KODE_TASK_LIST_ID
    else process.env.KODE_TASK_LIST_ID = previousTaskListId

    rmSync(tmpRoot, { recursive: true, force: true })
  })

  test('empty list prints expected empty message', async () => {
    const out = await renderToText(<WorkTasksViewForTests onClose={() => {}} />)

    expect(out).toContain('No tasks currently tracked')
  })

  test('non-empty list prints count header and status icons', async () => {
    const { id: id1 } = createTask({
      subject: 'Pending task',
      description: 'Pending description',
    })
    const { id: id2 } = createTask({
      subject: 'Completed task',
      description: 'Completed description',
    })
    const update = updateTask({
      taskId: id2,
      update: { status: 'completed' },
    })
    expect(update.ok).toBe(true)

    const out = await renderToText(<WorkTasksViewForTests onClose={() => {}} />)

    expect(out).toContain('2 tasks:')
    expect(out).toContain(`#${id1} Pending task`)
    expect(out).toContain(`#${id2} Completed task`)
    expect(out).toContain('◻')
    expect(out).toContain('✔')
  })
})
