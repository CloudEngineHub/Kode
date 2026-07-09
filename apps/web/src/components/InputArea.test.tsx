import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'bun:test'

import { InputArea } from './InputArea'

describe('InputArea accessibility', () => {
  test('associates the terminal prompt textarea with a label and shortcut hint', () => {
    const html = renderToStaticMarkup(
      <InputArea
        value="hello"
        onChange={() => {}}
        onSubmit={() => {}}
        isSending={false}
      />,
    )

    const labelMatch = html.match(/<label[^>]+for="([^"]+)"/)
    const textareaMatch = html.match(/<textarea[^>]+id="([^"]+)"/)
    const describedByMatch = html.match(
      /<textarea[^>]+aria-describedby="([^"]+)"/,
    )

    expect(labelMatch?.[1]).toBeTruthy()
    expect(textareaMatch?.[1]).toBe(labelMatch?.[1])
    expect(describedByMatch?.[1]).toBeTruthy()
    expect(html).toContain('Press Enter to send.')
    expect(html).toContain('aria-hidden="true"')
  })
})
