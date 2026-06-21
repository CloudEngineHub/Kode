import { describe, expect, test } from 'bun:test'
import { BashTool } from '#tools/tools/system/BashTool/BashTool'

describe('BashTool schema (compatibility)', () => {
  test('ignores unknown fields (reason/intent)', () => {
    expect(() =>
      BashTool.inputSchema.parse({ command: 'echo hi' }),
    ).not.toThrow()

    const withReason = BashTool.inputSchema.parse({
      command: 'echo hi',
      reason: 'Say hi',
    } as any)
    expect('reason' in withReason).toBe(false)

    const withIntent = BashTool.inputSchema.parse({
      command: 'echo hi',
      intent: 'Say hi',
    } as any)
    expect('intent' in withIntent).toBe(false)
  })

  test('renderToolUseMessage only includes description in verbose mode', () => {
    const input = { command: 'echo hi', description: 'Say hi' }
    expect(BashTool.renderToolUseMessage(input, { verbose: false })).toContain(
      'echo hi',
    )
    expect(BashTool.renderToolUseMessage(input, { verbose: true })).toContain(
      'Say hi',
    )
  })
})
