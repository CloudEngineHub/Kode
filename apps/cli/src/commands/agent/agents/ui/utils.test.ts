import { describe, expect, test } from 'bun:test'
import { __getOpenInEditorCommandForTests } from './utils'

describe('agent UI editor launcher', () => {
  test('uses the Windows file protocol handler without shell parsing', () => {
    const filePath = 'C:\\Users\\Admin\\Agents\\code & review.md'

    expect(__getOpenInEditorCommandForTests(filePath, 'win32')).toEqual({
      command: 'rundll32.exe',
      args: ['url.dll,FileProtocolHandler', filePath],
    })
  })

  test('uses platform launchers on macOS and Linux', () => {
    expect(__getOpenInEditorCommandForTests('/tmp/agent.md', 'darwin')).toEqual(
      {
        command: 'open',
        args: ['/tmp/agent.md'],
      },
    )
    expect(__getOpenInEditorCommandForTests('/tmp/agent.md', 'linux')).toEqual({
      command: 'xdg-open',
      args: ['/tmp/agent.md'],
    })
  })
})
