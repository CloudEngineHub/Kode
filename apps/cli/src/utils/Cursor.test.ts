import { describe, expect, it } from 'bun:test'

import { Cursor, countWrappedLines } from './Cursor'

describe('Cursor.render', () => {
  it('keeps the cursor line visible when maxHeight truncates', () => {
    const text = Array.from({ length: 10 }, (_, i) => `line${i}`).join('\n')
    const offset = text.indexOf('line5')
    const cursor = Cursor.fromText(text, 80, offset)

    const rendered = cursor.render(' ', '', s => `<${s}>`, { maxHeight: 5 })
    const lines = rendered.split('\n')

    expect(lines.length).toBe(5)
    expect(rendered.includes('<l>')).toBe(true)
    expect(lines[0]).toBe('... 3 lines hidden ...')
    expect(lines[4]).toBe('... 4 lines hidden ...')
  })

  it('renders without indicators when maxHeight is very small', () => {
    const text = Array.from({ length: 10 }, (_, i) => `line${i}`).join('\n')
    const offset = text.indexOf('line9')
    const cursor = Cursor.fromText(text, 80, offset)

    const rendered = cursor.render(' ', '', s => `<${s}>`, { maxHeight: 2 })
    const lines = rendered.split('\n')

    expect(lines.length).toBe(2)
    expect(rendered.includes('<l>')).toBe(true)
    expect(lines.some(line => line.includes('lines hidden'))).toBe(false)
  })

  it('masks wrapped content when mask is set', () => {
    const text = 'SECRET-KEY-1234567890'
    // Force wrapping so masking is applied across multiple lines.
    const cursor = Cursor.fromText(text, 6, text.length)
    const rendered = cursor.render(' ', '*', s => `<${s}>`)

    expect(rendered).not.toContain('SECRET')
    expect(rendered).toContain('*')
  })

  it('renders wide (CJK) characters without cursor splitting', () => {
    const text = 'ab你cd'
    const offset = text.indexOf('你')
    const cursor = Cursor.fromText(text, 5, offset)

    const rendered = cursor.render(' ', '', s => `<${s}>`)
    expect(rendered).toContain('<你>')
  })
})

describe('countWrappedLines', () => {
  it('matches basic newline behavior', () => {
    expect(countWrappedLines('', 10)).toBe(1)
    expect(countWrappedLines('a', 10)).toBe(1)
    expect(countWrappedLines('a\n', 10)).toBe(2)
    expect(countWrappedLines('\n', 10)).toBe(2)
    expect(countWrappedLines('a\nb', 10)).toBe(2)
  })

  it('wraps long lines and can stop early', () => {
    // columns=5 -> safeColumns=4 inside Cursor/MeasuredText
    expect(countWrappedLines('aaaaa', 5)).toBe(2)

    const text = Array.from({ length: 10 }, (_, i) => `line${i}`).join('\n')
    expect(countWrappedLines(text, 80, 3)).toBe(3)
  })

  it('counts wide characters by visual width', () => {
    // columns=5 -> safeColumns=4 inside Cursor/MeasuredText; each CJK char is width 2.
    expect(countWrappedLines('你你你', 5)).toBe(2)
  })
})
