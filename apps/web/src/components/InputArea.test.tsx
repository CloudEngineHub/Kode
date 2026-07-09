import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'bun:test'

import { InputArea, __inputAreaForTests } from './InputArea'

describe('InputArea accessibility', () => {
  test('associates the terminal prompt textarea with a label and shortcut hint', () => {
    const html = renderToStaticMarkup(
      <InputArea
        value="hello"
        onChange={() => {}}
        onSubmit={() => {}}
        isSending={false}
        controlsId="terminal-log"
      />,
    )

    const labelMatch = html.match(/<label[^>]+for="([^"]+)"/)
    const textareaMatch = html.match(/<textarea[^>]+id="([^"]+)"/)
    const describedByMatch = html.match(
      /<textarea[^>]+aria-describedby="([^"]+)"/,
    )
    const controlsMatch = html.match(/<textarea[^>]+aria-controls="([^"]+)"/)

    expect(labelMatch?.[1]).toBeTruthy()
    expect(textareaMatch?.[1]).toBe(labelMatch?.[1])
    expect(describedByMatch?.[1]).toBeTruthy()
    expect(controlsMatch?.[1]).toBe('terminal-log')
    expect(html).toContain('Press Enter to send.')
    expect(html).toContain('ArrowUp')
    expect(html).toContain('aria-hidden="true"')
  })

  test('classifies terminal prompt keyboard shortcuts without keyCode', () => {
    expect(__inputAreaForTests.shouldSubmitPromptKey({ key: 'Enter' })).toBe(
      true,
    )
    expect(
      __inputAreaForTests.shouldSubmitPromptKey({
        key: 'Enter',
        shiftKey: true,
      }),
    ).toBe(false)
    expect(
      __inputAreaForTests.shouldSubmitPromptKey({
        key: 'Enter',
        ctrlKey: true,
      }),
    ).toBe(false)
    expect(
      __inputAreaForTests.shouldSubmitPromptKey({
        key: 'Enter',
        isComposing: true,
      }),
    ).toBe(false)

    expect(
      __inputAreaForTests.getPromptHistoryDirection({
        key: 'ArrowUp',
        selectionStart: 0,
        selectionEnd: 0,
        valueLength: 8,
      }),
    ).toBe('previous')
    expect(
      __inputAreaForTests.getPromptHistoryDirection({
        key: 'ArrowDown',
        selectionStart: 8,
        selectionEnd: 8,
        valueLength: 8,
      }),
    ).toBe('next')
    expect(
      __inputAreaForTests.getPromptHistoryDirection({
        key: 'ArrowUp',
        selectionStart: 2,
        selectionEnd: 2,
        valueLength: 8,
      }),
    ).toBeNull()
    expect(
      __inputAreaForTests.getPromptHistoryDirection({
        key: 'ArrowUp',
        isComposing: true,
        selectionStart: 0,
        selectionEnd: 0,
        valueLength: 8,
      }),
    ).toBeNull()
    expect(
      __inputAreaForTests.getPromptHistoryDirection({
        key: 'ArrowDown',
        ctrlKey: true,
        selectionStart: 8,
        selectionEnd: 8,
        valueLength: 8,
      }),
    ).toBeNull()
  })
})
