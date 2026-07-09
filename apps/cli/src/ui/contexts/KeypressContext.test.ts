import { afterEach, describe, expect, test } from 'bun:test'

import {
  __createKeypressDataListenerForTests,
  type Key,
} from './KeypressContext'

type CapturedKeypress = {
  input: string
  name: string
  sequence: string
  return: boolean
  paste: boolean
  insertable: boolean
}

const activeListeners = new Set<(data: string) => void>()

function createHarness() {
  const events: CapturedKeypress[] = []
  const listener = __createKeypressDataListenerForTests(
    (input: string, key: Key) => {
      events.push({
        input,
        name: key.name,
        sequence: key.sequence,
        return: key.return ?? false,
        paste: key.paste,
        insertable: key.insertable,
      })
    },
  )
  activeListeners.add(listener)
  return { events, listener }
}

afterEach(() => {
  for (const listener of activeListeners) listener('')
  activeListeners.clear()
})

describe('KeypressContext stdin chunk parsing', () => {
  test('coalesces CR key repeat in one chunk into one Return', () => {
    const { events, listener } = createHarness()

    listener('\r\r\r')

    expect(events).toEqual([
      {
        input: '',
        name: 'return',
        sequence: '\r',
        return: true,
        paste: false,
        insertable: false,
      },
    ])
  })

  test('emits text followed by one Return for a trailing CR burst', () => {
    const { events, listener } = createHarness()

    listener('hello\r\r')

    expect(events).toEqual([
      {
        input: 'hello',
        name: '',
        sequence: 'hello',
        return: false,
        paste: false,
        insertable: true,
      },
      {
        input: '',
        name: 'return',
        sequence: '\r',
        return: true,
        paste: false,
        insertable: false,
      },
    ])
  })

  test('coalesces rapid Return events delivered in separate chunks', () => {
    const { events, listener } = createHarness()

    listener('hello')
    listener('\r')
    listener('\r')

    expect(events.map(event => [event.input, event.name, event.paste])).toEqual(
      [
        ['hello', '', false],
        ['', 'return', false],
      ],
    )
  })

  for (const [name, data, returnSequence] of [
    ['CRLF', 'hello\r\n', '\r'],
    ['repeated CRLF', 'hello\r\n\r\n', '\r'],
  ] as const) {
    test(`normalizes a trailing ${name} burst to one Return`, () => {
      const { events, listener } = createHarness()

      listener(data)

      expect(
        events.map(event => [event.input, event.name, event.sequence]),
      ).toEqual([
        ['hello', '', 'hello'],
        ['', 'return', returnSequence],
      ])
      expect(events.every(event => event.paste === false)).toBe(true)
    })
  }

  test('keeps raw LF as the Ctrl+J multiline shortcut', () => {
    const { events, listener } = createHarness()

    listener('\n')

    expect(
      events.map(event => [
        event.input,
        event.name,
        event.sequence,
        event.return,
      ]),
    ).toEqual([['j', 'j', '\n', false]])
  })

  test('ignores CSI-u Return repeat while preserving text key repeat', () => {
    const { events, listener } = createHarness()

    listener('\x1b[97;1;2u')
    listener('\x1b[13u')
    listener('\x1b[13;1;2u')
    listener('\x1b[13;1;3u')

    expect(
      events.map(event => [event.input, event.name, event.return]),
    ).toEqual([
      ['a', 'a', false],
      ['', 'return', true],
    ])
  })

  test('keeps bracketed paste atomic and preserves repeated returns', () => {
    const { events, listener } = createHarness()

    listener('\x1b[200~')
    listener('\u4f60\u597d\r\r')
    listener('\x1b[201~')

    expect(events).toEqual([
      {
        input: '\u4f60\u597d\r\r',
        name: '',
        sequence: '\u4f60\u597d\r\r',
        return: false,
        paste: true,
        insertable: true,
      },
    ])
  })

  test('keeps unbracketed multiline chunks as one bulk insertion', () => {
    const { events, listener } = createHarness()

    listener('line 1\r\nline 2\r\n')

    expect(events).toEqual([
      {
        input: 'line 1\r\nline 2\r\n',
        name: '',
        sequence: 'line 1\r\nline 2\r\n',
        return: false,
        paste: false,
        insertable: true,
      },
    ])
  })

  test('keeps a CJK IME commit as one insertable event', () => {
    const { events, listener } = createHarness()

    listener('\u4f60\u597d\u4e16\u754c')

    expect(events).toEqual([
      {
        input: '\u4f60\u597d\u4e16\u754c',
        name: '',
        sequence: '\u4f60\u597d\u4e16\u754c',
        return: false,
        paste: false,
        insertable: true,
      },
    ])
  })
})
