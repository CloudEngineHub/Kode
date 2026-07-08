import { normalizeTerminalDimension } from './viewportRows'

type ColumnBudgetOptions = {
  columns: number
  reservedColumns?: number
  minColumns?: number
  maxColumns?: number
}

type SplitColumnBudgetOptions = ColumnBudgetOptions & {
  segments?: number
}

function floorFinite(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) return fallback
  return Math.floor(value)
}

function nonNegativeColumns(value: number | undefined): number {
  return Math.max(0, floorFinite(value ?? 0))
}

export function computeAvailableColumns({
  columns,
  reservedColumns = 0,
  minColumns = 1,
  maxColumns,
}: ColumnBudgetOptions): number {
  const normalizedColumns = normalizeTerminalDimension(columns, 0)
  const minimumColumns = nonNegativeColumns(minColumns)
  const availableColumns = Math.max(
    0,
    normalizedColumns - nonNegativeColumns(reservedColumns),
  )

  if (availableColumns <= 0) return minimumColumns > 0 ? 1 : 0

  const upperBound =
    typeof maxColumns === 'number'
      ? Math.max(1, Math.min(availableColumns, nonNegativeColumns(maxColumns)))
      : availableColumns
  const effectiveMinimum = Math.min(minimumColumns, upperBound)
  return Math.max(effectiveMinimum, upperBound)
}

export function computeSplitColumns({
  columns,
  segments = 2,
  reservedColumns = 0,
  minColumns = 1,
  maxColumns,
}: SplitColumnBudgetOptions): number {
  const normalizedColumns = normalizeTerminalDimension(columns, 0)
  const normalizedSegments = Math.max(1, nonNegativeColumns(segments))

  return computeAvailableColumns({
    columns: Math.floor(normalizedColumns / normalizedSegments),
    reservedColumns,
    minColumns,
    maxColumns,
  })
}
