import { beforeEach, describe, expect, test } from 'bun:test'
import { Box, render } from 'ink'
import React from 'react'
import { PassThrough } from 'stream'
import stripAnsi from 'strip-ansi'
import { TodosViewForTests } from '#cli-commands/builtin/todos'
import { setTodos } from '#core/utils/todoStorage'

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

  const instance = render(<Box>{element}</Box>, {
    stdin: stdin as unknown as NodeJS.ReadStream,
    stdout: stdout as unknown as NodeJS.WriteStream,
    exitOnCtrlC: false,
  })

  await new Promise(resolve => setTimeout(resolve, 0))
  instance.unmount()

  return stripAnsi(rawOutput)
}

describe('/todos command (Claude zE9 parity)', () => {
  beforeEach(() => {
    setTodos([])
  })

  test('empty list prints Claude empty message', async () => {
    const out = await renderToText(
      <TodosViewForTests agentId={undefined} onClose={() => {}} />,
    )

    expect(out).toContain('No todos currently tracked')
  })

  test('non-empty list prints count header and checkbox list', async () => {
    setTodos([
      {
        id: '1',
        content: 'Pending task',
        status: 'pending',
        activeForm: 'Working on pending task',
        priority: 'medium',
      },
      {
        id: '2',
        content: 'Completed task',
        status: 'completed',
        activeForm: 'Completing task',
        priority: 'medium',
      },
    ])

    const out = await renderToText(
      <TodosViewForTests agentId={undefined} onClose={() => {}} />,
    )

    expect(out).toContain('2 todos:')
    expect(out).toContain('☐ Pending task')
    expect(out).toContain('☒ Completed task')
  })
})
