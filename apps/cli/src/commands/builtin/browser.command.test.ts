import { describe, expect, test } from 'bun:test'

import browser from './browser'

describe('/browser command', () => {
  test('reports a fail-closed disabled adapter', async () => {
    const output = await browser.call('status')
    expect(output).toContain('Browser adapter: disabled (unavailable)')
    expect(output).toContain('fail-closed')
    expect(output).toContain('No navigation')
  })

  test('does not expose an action surface through unsupported arguments', async () => {
    const output = await browser.call('navigate https://example.test')
    expect(output).toContain('Unsupported browser action')
    expect(output).toContain('fail-closed')
  })
})
