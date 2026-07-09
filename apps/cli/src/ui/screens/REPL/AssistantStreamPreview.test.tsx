import { expect, test } from 'bun:test'
import { Box, Text, render } from 'ink'
import React from 'react'
import { PassThrough } from 'node:stream'
import stripAnsi from 'strip-ansi'
import { AssistantStreamPreview } from './AssistantStreamPreview'
import { createAssistantStreamStore } from './assistantStreamStore'

async function renderToText(element: React.ReactElement): Promise<string> {
  const stdout = new PassThrough() as PassThrough & {
    isTTY?: boolean
    columns?: number
    rows?: number
  }
  stdout.isTTY = true
  stdout.columns = 80
  stdout.rows = 24

  let rawOutput = ''
  stdout.on('data', chunk => {
    rawOutput += chunk.toString('utf8')
  })

  const instance = render(element, {
    stdout: stdout as unknown as NodeJS.WriteStream,
    exitOnCtrlC: false,
  })
  await new Promise(resolve => setTimeout(resolve, 0))
  instance.unmount()
  return stripAnsi(rawOutput).replaceAll('\r', '')
}

test('does not reserve a blank viewport before the first token', async () => {
  const store = createAssistantStreamStore()
  const turn = new AbortController()
  store.beginTurn(turn)
  store.handleUpdate(turn, { type: 'start', agentId: 'main' })

  const output = await renderToText(
    <Box flexDirection="column">
      <Text>above</Text>
      <AssistantStreamPreview
        store={store}
        transientItems={[]}
        maxHeight={8}
        isVisible
        debug={false}
      />
      <Text>below</Text>
    </Box>,
  )

  const betweenSentinels = output.slice(
    output.indexOf('above') + 'above'.length,
    output.indexOf('below'),
  )
  expect(betweenSentinels).toBe('\n')
})

test('renders the first text delta through AssistantTextMessage', async () => {
  const store = createAssistantStreamStore()
  const turn = new AbortController()
  store.beginTurn(turn)
  store.handleUpdate(turn, { type: 'text_delta', delta: 'streamed text' })

  const output = await renderToText(
    <AssistantStreamPreview
      store={store}
      transientItems={[]}
      maxHeight={8}
      isVisible
      debug={false}
    />,
  )

  expect(output).toContain('streamed text')
})
