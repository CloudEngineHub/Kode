import { describe, expect, test } from 'bun:test'
import type { Key } from '#ui-ink/hooks/useKeypress'
import { __getLineFeedInputActionForTests } from './TextInput'

function makeKey(overrides: Partial<Key>): Key {
  return {
    sequence: '',
    name: '',
    upArrow: false,
    downArrow: false,
    leftArrow: false,
    rightArrow: false,
    pageDown: false,
    pageUp: false,
    return: false,
    escape: false,
    ctrl: false,
    shift: false,
    tab: false,
    backspace: false,
    delete: false,
    meta: false,
    paste: false,
    insertable: false,
    ...overrides,
  }
}

describe('__getLineFeedInputActionForTests', () => {
  test('treats plain LF as submit in multiline input', () => {
    expect(
      __getLineFeedInputActionForTests({
        multiline: true,
        key: makeKey({}),
      }),
    ).toBe('submit')
  })

  test('keeps modified LF as newline in multiline input', () => {
    expect(
      __getLineFeedInputActionForTests({
        multiline: true,
        key: makeKey({ shift: true }),
      }),
    ).toBe('newline')

    expect(
      __getLineFeedInputActionForTests({
        multiline: true,
        key: makeKey({ meta: true }),
      }),
    ).toBe('newline')

    expect(
      __getLineFeedInputActionForTests({
        multiline: true,
        key: makeKey({ ctrl: true }),
      }),
    ).toBe('newline')

    expect(
      __getLineFeedInputActionForTests({
        multiline: true,
        key: makeKey({ option: true }),
      }),
    ).toBe('newline')
  })

  test('single-line input always treats LF as submit', () => {
    expect(
      __getLineFeedInputActionForTests({
        multiline: false,
        key: makeKey({ shift: true }),
      }),
    ).toBe('submit')
  })
})
