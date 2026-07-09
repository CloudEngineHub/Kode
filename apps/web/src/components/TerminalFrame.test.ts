import { describe, expect, test } from 'bun:test'

import { __terminalFrameForTests } from './TerminalFrame'

describe('TerminalFrame helpers', () => {
  test('labels runtime attachment without network wording', () => {
    expect(__terminalFrameForTests.terminalAttachmentLabel(true)).toBe(
      'attached',
    )
    expect(__terminalFrameForTests.terminalAttachmentLabel(false)).toBe(
      'detached',
    )
    expect(__terminalFrameForTests.terminalAttachmentLabel(undefined)).toBe(
      'detached',
    )
  })

  test('formats terminal shortcut hints for the status line', () => {
    expect(
      __terminalFrameForTests.terminalStatusHintText([
        { key: 'Enter', label: 'send' },
        { key: '/help', label: 'commands' },
      ]),
    ).toBe('Enter send | /help commands')
  })
})
