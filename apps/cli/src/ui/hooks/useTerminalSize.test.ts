import { describe, expect, test } from 'bun:test'

import { areTerminalSizesEqual, readTerminalSize } from './useTerminalSize'

describe('terminal size helpers', () => {
  test('normalizes missing terminal dimensions while preserving minimized axes', () => {
    expect(readTerminalSize({ columns: undefined, rows: undefined })).toEqual({
      columns: 80,
      rows: 24,
    })
    expect(readTerminalSize({ columns: Number.NaN, rows: Number.NaN })).toEqual(
      {
        columns: 80,
        rows: 24,
      },
    )
    expect(readTerminalSize({ columns: 0, rows: 0 })).toEqual({
      columns: 0,
      rows: 0,
    })
  })

  test('identifies duplicate resize dimensions before notifying subscribers', () => {
    expect(
      areTerminalSizesEqual(
        { columns: 100, rows: 30 },
        { columns: 100, rows: 30 },
      ),
    ).toBe(true)
    expect(
      areTerminalSizesEqual(
        { columns: 100, rows: 30 },
        { columns: 100, rows: 29 },
      ),
    ).toBe(false)
    expect(
      areTerminalSizesEqual(
        { columns: 100, rows: 30 },
        { columns: 99, rows: 30 },
      ),
    ).toBe(false)
  })
})
