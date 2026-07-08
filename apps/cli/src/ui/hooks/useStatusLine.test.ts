import { describe, expect, test } from 'bun:test'
import { normalizeStatusLineOutput } from './useStatusLine'

describe('normalizeStatusLineOutput', () => {
  test('keeps status line output to the first non-empty line', () => {
    expect(
      normalizeStatusLineOutput('\n  first status  \nsecond status\n'),
    ).toBe('first status')
  })

  test('returns null for empty output', () => {
    expect(normalizeStatusLineOutput('\n  \r\n')).toBeNull()
  })
})
