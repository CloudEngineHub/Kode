import { expect, test } from 'bun:test'
import { Box, render } from 'ink'
import React from 'react'
import { PassThrough } from 'node:stream'
import stripAnsi from 'strip-ansi'

import { AssistantBackgroundTaskOutputMessage } from './AssistantBackgroundTaskOutputMessage'

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

test('background task output respects transient max height even in verbose mode', async () => {
  const text = await renderToText(
    <AssistantBackgroundTaskOutputMessage
      content={
        '<background-task-output>one\ntwo\nthree\nfour\nfive\nsix</background-task-output>'
      }
      verbose
      maxHeight={3}
    />,
  )

  expect(text).toContain('3 lines hidden, showing last 3 lines')
  expect(text).not.toContain('one')
  expect(text).toContain('four')
  expect(text).toContain('five')
  expect(text).toContain('six')
})
