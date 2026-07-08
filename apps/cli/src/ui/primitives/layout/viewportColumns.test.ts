import { describe, expect, it } from 'bun:test'

import { computeAvailableColumns, computeSplitColumns } from './viewportColumns'

describe('viewport column budget helpers', () => {
  it('subtracts reserved columns while keeping a positive display width', () => {
    expect(computeAvailableColumns({ columns: 80, reservedColumns: 12 })).toBe(
      68,
    )
    expect(computeAvailableColumns({ columns: 8, reservedColumns: 12 })).toBe(1)
    expect(computeAvailableColumns({ columns: 0, reservedColumns: 12 })).toBe(1)
  })

  it('allows zero-width budgets only when explicitly requested', () => {
    expect(
      computeAvailableColumns({
        columns: 0,
        reservedColumns: 12,
        minColumns: 0,
      }),
    ).toBe(0)
  })

  it('caps available columns without exceeding tiny terminals', () => {
    expect(
      computeAvailableColumns({
        columns: 120,
        reservedColumns: 10,
        maxColumns: 80,
      }),
    ).toBe(80)
    expect(
      computeAvailableColumns({
        columns: 20,
        reservedColumns: 10,
        minColumns: 16,
        maxColumns: 80,
      }),
    ).toBe(10)
  })

  it('computes split pane content width from the per-pane budget', () => {
    expect(
      computeSplitColumns({
        columns: 80,
        segments: 2,
        reservedColumns: 6,
      }),
    ).toBe(34)
    expect(
      computeSplitColumns({
        columns: 10,
        segments: 2,
        reservedColumns: 12,
      }),
    ).toBe(1)
  })
})
