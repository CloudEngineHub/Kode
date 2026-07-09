import { describe, expect, test } from 'bun:test'

import { __runtimeStatusBarForTests } from './RuntimeStatusBar'

describe('RuntimeStatusBar helpers', () => {
  test('shortens long session ids for compact headers', () => {
    expect(__runtimeStatusBarForTests.shortSessionId(null)).toBe('new')
    expect(__runtimeStatusBarForTests.shortSessionId('abc')).toBe('abc')
    expect(
      __runtimeStatusBarForTests.shortSessionId(
        '12345678-1234-1234-1234-123456789abc',
      ),
    ).toBe('12345678')
  })
})
