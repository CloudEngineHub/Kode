import { describe, expect, test } from 'bun:test'
import { Box, render } from 'ink'
import React from 'react'
import { PassThrough } from 'stream'
import stripAnsi from 'strip-ansi'
import { MCPTool } from '#tools/tools/mcp/MCPTool/MCPTool'

async function renderToText(element: React.ReactElement): Promise<string> {
  const stdin = new PassThrough()
  ;(stdin as any).isTTY = true
  ;(stdin as any).isRaw = true
  ;(stdin as any).setRawMode = () => {}
  stdin.setEncoding('utf8')
  stdin.resume()

  const stdout = new PassThrough()
  ;(stdout as any).isTTY = true
  ;(stdout as any).columns = 100
  ;(stdout as any).rows = 30

  let rawOutput = ''
  stdout.on('data', chunk => {
    rawOutput += chunk.toString('utf8')
  })

  const instance = render(<Box>{element}</Box>, {
    stdin: stdin as any,
    stdout: stdout as any,
    exitOnCtrlC: false,
  })

  await new Promise(resolve => setTimeout(resolve, 0))

  instance.unmount()
  return stripAnsi(rawOutput)
}

describe('MCPTool.renderToolResultMessage', () => {
  test('renders FastMCP string result content as text instead of JSON wrapper', async () => {
    const content = '地点：西安\n温度：22 celsius\n状况：晴'
    const element = MCPTool.renderToolResultMessage?.(
      JSON.stringify({ result: content }),
    )

    const out = await renderToText(<>{element}</>)

    expect(out).toContain('地点：西安')
    expect(out).toContain('温度：22 celsius')
    expect(out).toContain('状况：晴')
    expect(out).not.toContain('{"result"')
  })
})
