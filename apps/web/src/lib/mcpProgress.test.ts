import { describe, expect, test } from 'bun:test'

import {
  __mcpProgressForTests,
  formatMcpProgressNumber,
  sanitizeMcpProgressLabel,
  sanitizeMcpProgressMessage,
} from './mcpProgress'

describe('MCP progress display helpers', () => {
  test('removes control characters and bounds progress messages', () => {
    const message = sanitizeMcpProgressMessage(
      `${'x'.repeat(260)}\u001B[2J\nnext`,
    )

    expect(message).not.toContain('\u001B')
    expect(message).not.toContain('\n')
    expect(message).toContain('...')
    expect(message.length).toBeLessThanOrEqual(
      __mcpProgressForTests.MCP_PROGRESS_MESSAGE_MAX_LENGTH + 3,
    )
  })

  test('formats finite progress numbers only', () => {
    expect(formatMcpProgressNumber(1)).toBe('1')
    expect(formatMcpProgressNumber(1.234)).toBe('1.23')
    expect(formatMcpProgressNumber(Number.NaN)).toBeNull()
    expect(formatMcpProgressNumber(Infinity)).toBeNull()
  })

  test('bounds server and tool labels for display', () => {
    const label = sanitizeMcpProgressLabel(`${'tool'.repeat(40)}\u001B[2J`)

    expect(label).not.toContain('\u001B')
    expect(label).toContain('...')
    expect(label.length).toBeLessThanOrEqual(
      __mcpProgressForTests.MCP_PROGRESS_LABEL_MAX_LENGTH + 3,
    )
  })
})
