import { describe, expect, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { TerminalStatusLine, __terminalFrameForTests } from './TerminalFrame'

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

  test('formats viewport dimensions for terminal status display', () => {
    expect(
      __terminalFrameForTests.terminalViewportSizeText({ cols: 120, rows: 32 }),
    ).toBe('120x32')
    expect(__terminalFrameForTests.terminalViewportSizeText(null)).toBe('auto')
  })

  test('formats terminal status segments for aria labels', () => {
    expect(
      __terminalFrameForTests.terminalStatusSegmentText([
        { key: 'daemon', label: 'daemon online' },
        { key: 'agent', label: 'agent running' },
      ]),
    ).toBe('daemon online | agent running')
  })

  test('renders viewport dimensions in the status line', () => {
    const html = renderToStaticMarkup(
      React.createElement(TerminalStatusLine, {
        leading: 'running',
        segments: [
          { key: 'daemon', label: 'daemon online' },
          { key: 'agent', label: 'agent running' },
        ],
        viewportSize: { cols: 100, rows: 24 },
        hints: [{ key: 'Enter', label: 'send' }],
      }),
    )

    expect(html).toContain('100x24')
    expect(html).toContain('daemon online')
    expect(html).toContain(
      'running | 100x24 viewport | daemon online | agent running | Enter send',
    )
    expect(html).not.toContain('<span>100x24</span>')
    expect(html).not.toContain('>daemon online</span>')
  })
})
