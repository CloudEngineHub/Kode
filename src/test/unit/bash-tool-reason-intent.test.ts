import { describe, expect, test } from 'bun:test'
import { BashTool } from '@tools/BashTool/BashTool'

describe('BashTool reason/intent field', () => {
  test('schema accepts optional reason/intent (back-compat)', () => {
    expect(() => BashTool.inputSchema.parse({ command: 'echo hi' })).not.toThrow()
    expect(() =>
      BashTool.inputSchema.parse({ command: 'echo hi', reason: 'Say hi' }),
    ).not.toThrow()
    expect(() =>
      BashTool.inputSchema.parse({ command: 'echo hi', intent: 'Say hi' }),
    ).not.toThrow()
  })

  test('renderToolUseMessage only includes intent in verbose mode', () => {
    const input = { command: 'echo hi', reason: 'Say hi' } as any
    expect(BashTool.renderToolUseMessage(input, { verbose: false })).toBe(
      'echo hi',
    )
    expect(BashTool.renderToolUseMessage(input, { verbose: true })).toContain(
      'Say hi',
    )
  })
})

