import { describe, expect, it } from 'bun:test'
import stripAnsi from 'strip-ansi'

import { getCachedStringWidth } from '#cli-utils/textWidth'
import { wrapLines } from './wrapLines'

describe('wrapLines', () => {
  it('hard-wraps plain text by visual width', () => {
    expect(wrapLines(['abcdef'], 3)).toEqual(['abc', 'def'])
    expect(wrapLines([''], 3)).toEqual([''])
  })

  it('keeps CJK wide characters within the requested width', () => {
    const wrapped = wrapLines(['你你你'], 4)

    expect(wrapped).toEqual(['你你', '你'])
    for (const line of wrapped) {
      expect(getCachedStringWidth(line)).toBeLessThanOrEqual(4)
    }
  })

  it('wraps ANSI-styled text without counting escape sequences', () => {
    const red = '\x1b[31mabcdef\x1b[39m'
    const wrapped = wrapLines([red], 3)

    expect(wrapped.map(line => stripAnsi(line))).toEqual(['abc', 'def'])
    expect(wrapped.join('\n')).toContain('\x1b[31m')
    for (const line of wrapped) {
      expect(getCachedStringWidth(stripAnsi(line))).toBeLessThanOrEqual(3)
    }
  })

  it('clamps invalid widths to one column', () => {
    expect(wrapLines(['abc'], 0)).toEqual(['a', 'b', 'c'])
  })
})
