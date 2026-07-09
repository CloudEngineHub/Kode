import { describe, expect, test } from 'bun:test'

import {
  estimateTerminalViewportSize,
  isSameTerminalViewportSize,
} from './terminalViewport'

describe('terminal viewport sizing', () => {
  test('estimates terminal columns and rows from visible pixels', () => {
    expect(
      estimateTerminalViewportSize({
        width: 800,
        height: 480,
      }),
    ).toEqual({ cols: 100, rows: 20 })

    expect(
      estimateTerminalViewportSize({
        width: 24,
        height: 24,
      }),
    ).toEqual({ cols: 24, rows: 6 })

    expect(
      estimateTerminalViewportSize({
        width: 0,
        height: 480,
      }),
    ).toBeNull()
  })

  test('compares terminal viewport dimensions by value', () => {
    expect(
      isSameTerminalViewportSize(
        { cols: 100, rows: 20 },
        { cols: 100, rows: 20 },
      ),
    ).toBe(true)
    expect(
      isSameTerminalViewportSize(
        { cols: 100, rows: 20 },
        { cols: 99, rows: 20 },
      ),
    ).toBe(false)
    expect(isSameTerminalViewportSize(null, null)).toBe(true)
  })
})
