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
})
