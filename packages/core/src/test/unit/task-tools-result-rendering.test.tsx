import { expect, test } from 'bun:test'
import { Box, render } from 'ink'
import React from 'react'
import { PassThrough } from 'stream'
import stripAnsi from 'strip-ansi'
import { renderInkToolResultMessage } from '#ui-ink/toolPresenters/registry'
import { TaskCreateTool } from '#tools/tools/interaction/TaskCreateTool/TaskCreateTool'
import { TaskUpdateTool } from '#tools/tools/interaction/TaskUpdateTool/TaskUpdateTool'

async function renderToText(element: React.ReactElement): Promise<string> {
  const stdout = new PassThrough()
  ;(stdout as any).isTTY = true
  ;(stdout as any).columns = 100
  ;(stdout as any).rows = 30

  let rawOutput = ''
  stdout.on('data', chunk => {
    rawOutput += chunk.toString('utf8')
  })

  const instance = render(<Box>{element}</Box>, {
    stdout: stdout as any,
    exitOnCtrlC: false,
  })

  await new Promise(resolve => setTimeout(resolve, 0))
  instance.unmount()

  return stripAnsi(rawOutput)
}

test('TaskCreateTool result renderer is safe under Ink layout containers', async () => {
  const out = await renderToText(
    <>
      {renderInkToolResultMessage(
        TaskCreateTool,
        { task: { id: '1', subject: 'Inspect current changes' } },
        { verbose: false },
      )}
    </>,
  )

  expect(out).toContain('Task #1 created: Inspect current changes')
})

test('TaskUpdateTool result renderer is safe under Ink layout containers', async () => {
  const out = await renderToText(
    <>
      {renderInkToolResultMessage(
        TaskUpdateTool,
        {
          success: true,
          taskId: '1',
          updatedFields: ['status'],
          statusChange: { from: 'pending', to: 'in_progress' },
        },
        { verbose: false },
      )}
    </>,
  )

  expect(out).toContain('Task #1 updated')
  expect(out).toContain('in progress')
})
