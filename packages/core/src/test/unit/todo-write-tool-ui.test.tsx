import { describe, expect, test } from 'bun:test'
import { Box, render } from 'ink'
import React from 'react'
import { PassThrough } from 'stream'
import stripAnsi from 'strip-ansi'
import { AssistantToolUseMessage } from '#ui-ink/components/messages/AssistantToolUseMessage'
import { TodoWriteTool } from '#tools/tools/interaction/TodoWriteTool/TodoWriteTool'

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

describe('TodoWriteTool UI parity (Reference CLI)', () => {
  test('tool_use line is hidden (renderToolUseMessage=null, userFacingName="")', async () => {
    const out = await renderToText(
      <AssistantToolUseMessage
        param={{
          type: 'tool_use',
          id: 't1',
          name: TodoWriteTool.name,
          input: {
            todos: [
              {
                content: 'Do thing',
                status: 'pending',
                activeForm: 'Doing thing',
              },
            ],
          },
        }}
        costUSD={0}
        durationMs={0}
        addMargin={false}
        tools={[TodoWriteTool]}
        debug={false}
        verbose={false}
        erroredToolUseIDs={new Set()}
        inProgressToolUseIDs={new Set(['t1'])}
        unresolvedToolUseIDs={new Set(['t1'])}
        shouldAnimate={false}
        shouldShowDot={false}
      />,
    )

    expect(out.trim()).toBe('')
  })

  test('renderToolResultMessage is hidden by default', async () => {
    const element = TodoWriteTool.renderToolResultMessage?.(
      { oldTodos: [], newTodos: [] },
      { verbose: false },
    )
    const out = await renderToText(<>{element}</>)
    expect(out.trim()).toBe('')
  })
})
