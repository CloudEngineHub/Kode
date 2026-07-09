import { describe, expect, test } from 'bun:test'

import {
  createWebPastedTextPlaceholder,
  expandWebPastedTextPlaceholders,
  insertWebPastedTextPlaceholder,
  retainReferencedWebPastedTextSegments,
  shouldFoldWebTextPaste,
} from './pastedText'

describe('web pasted text helpers', () => {
  test('folds large or multi-line pasted text', () => {
    expect(shouldFoldWebTextPaste('short text')).toBe(false)
    expect(shouldFoldWebTextPaste('x'.repeat(512))).toBe(true)
    expect(shouldFoldWebTextPaste('a\nb\nc')).toBe(true)
  })

  test('creates compact placeholders with line counts', () => {
    expect(createWebPastedTextPlaceholder({ id: 1, text: 'hello' })).toBe(
      '[Pasted text #1]',
    )
    expect(createWebPastedTextPlaceholder({ id: 2, text: 'a\r\nb\nc' })).toBe(
      '[Pasted text #2 +2 lines]',
    )
  })

  test('inserts and expands pasted text placeholders', () => {
    const inserted = insertWebPastedTextPlaceholder({
      input: 'hello world',
      text: 'A\nB\nC',
      id: 1,
      selectionStart: 6,
      selectionEnd: 11,
    })

    expect(inserted.input).toBe('hello [Pasted text #1 +2 lines]')
    expect(inserted.cursorOffset).toBe(inserted.input.length)
    expect(
      expandWebPastedTextPlaceholders({
        input: inserted.input,
        pastedTexts: [inserted.segment],
      }),
    ).toBe('hello A\nB\nC')
  })

  test('drops pasted segments whose placeholders are no longer referenced', () => {
    const kept = { placeholder: '[Pasted text #1]', text: 'kept' }
    const removed = { placeholder: '[Pasted text #2]', text: 'removed' }

    expect(
      retainReferencedWebPastedTextSegments({
        input: 'use [Pasted text #1]',
        pastedTexts: [kept, removed],
      }),
    ).toEqual([kept])
  })
})
