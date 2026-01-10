import { expect, test } from 'bun:test'
import React from 'react'
import { PassThrough } from 'stream'
import stripAnsi from 'strip-ansi'
import { render } from 'ink'
import { KillShellTool } from '#tools/tools/system/KillShellTool/KillShellTool'
import { renderInkToolResultMessage } from '#ui-ink/toolPresenters/registry'

test('KillShellTool UI strings match expected wording', async () => {
  expect(KillShellTool.renderToolUseMessage({ shell_id: 'abc123' })).toBe(
    'Kill shell: abc123',
  )

  const stdoutStream = new PassThrough()
  ;(stdoutStream as unknown as { isTTY?: boolean }).isTTY = true
  ;(stdoutStream as unknown as { columns?: number }).columns = 80
  stdoutStream.setEncoding('utf8')

  let raw = ''
  stdoutStream.on('data', chunk => {
    raw += chunk.toString('utf8')
  })

  const instance = render(
    <>
      {renderInkToolResultMessage(
        KillShellTool,
        { message: 'ok', shell_id: 'abc123' },
        { verbose: false },
      )}
    </>,
    {
      stdout: stdoutStream as unknown as NodeJS.WriteStream,
      exitOnCtrlC: false,
    },
  )

  await new Promise(resolve => setTimeout(resolve, 10))
  instance.unmount()

  const output = stripAnsi(raw)
  expect(output).toContain('Shell abc123 killed')
})
