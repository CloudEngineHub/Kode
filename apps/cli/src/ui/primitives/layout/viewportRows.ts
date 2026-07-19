export type ViewportHeightClass =
  'minimized' | 'micro' | 'tight' | 'compact' | 'normal' | 'tall'

type HeightClassThresholds = Partial<{
  microRows: number
  tightRows: number
  compactRows: number
  tallRows: number
}>

type RowBudgetOptions = {
  rows: number
  reservedRows?: number
  safeMarginRows?: number
  minRows?: number
  maxRows?: number
  ratio?: number
}

function floorFinite(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) return fallback
  return Math.floor(value)
}

function nonNegativeRows(value: number | undefined): number {
  return Math.max(0, floorFinite(value ?? 0))
}

export function normalizeTerminalDimension(
  value: unknown,
  fallback: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }
  return Math.max(0, Math.floor(value))
}

export function getViewportHeightClass(
  rows: number,
  thresholds: HeightClassThresholds = {},
): ViewportHeightClass {
  const normalizedRows = normalizeTerminalDimension(rows, 0)
  const microRows = thresholds.microRows ?? 12
  const tightRows = thresholds.tightRows ?? 18
  const compactRows = thresholds.compactRows ?? 22
  const tallRows = thresholds.tallRows ?? 40

  if (normalizedRows <= 0) return 'minimized'
  if (normalizedRows <= microRows) return 'micro'
  if (normalizedRows <= tightRows) return 'tight'
  if (normalizedRows <= compactRows) return 'compact'
  if (normalizedRows >= tallRows) return 'tall'
  return 'normal'
}

export function isTightViewportHeight(
  rows: number,
  thresholds: HeightClassThresholds = {},
): boolean {
  const heightClass = getViewportHeightClass(rows, thresholds)
  return (
    heightClass === 'minimized' ||
    heightClass === 'micro' ||
    heightClass === 'tight'
  )
}

export function isCompactViewportHeight(
  rows: number,
  thresholds: HeightClassThresholds = {},
): boolean {
  const heightClass = getViewportHeightClass(rows, thresholds)
  return (
    heightClass === 'minimized' ||
    heightClass === 'micro' ||
    heightClass === 'tight' ||
    heightClass === 'compact'
  )
}

export function computeFrameHeight(rows: number, safeMarginRows = 1): number {
  const normalizedRows = normalizeTerminalDimension(rows, 0)
  return Math.max(1, normalizedRows - nonNegativeRows(safeMarginRows))
}

export function computeScreenFrameReservedRows({
  paddingY,
  gap,
  exitPromptRows = 0,
  showDivider = true,
}: {
  paddingY: number
  gap: number
  exitPromptRows?: number
  showDivider?: boolean
}): number {
  const headerRows = 1 + nonNegativeRows(exitPromptRows)
  const dividerRows = showDivider ? 1 : 0
  const gapCount = showDivider ? 2 : 1
  return (
    headerRows +
    dividerRows +
    nonNegativeRows(gap) * gapCount +
    nonNegativeRows(paddingY) * 2
  )
}

export function computeAvailableRows({
  rows,
  reservedRows = 0,
  safeMarginRows = 0,
  minRows = 1,
  maxRows,
}: RowBudgetOptions): number {
  const normalizedRows = normalizeTerminalDimension(rows, 0)
  const minimumRows = nonNegativeRows(minRows)
  const availableRows = Math.max(
    0,
    normalizedRows -
      nonNegativeRows(reservedRows) -
      nonNegativeRows(safeMarginRows),
  )

  if (availableRows <= 0) return minimumRows > 0 ? 1 : 0

  const upperBound =
    typeof maxRows === 'number'
      ? Math.max(1, Math.min(availableRows, nonNegativeRows(maxRows)))
      : availableRows
  const effectiveMinimum = Math.min(minimumRows, upperBound)
  return Math.max(effectiveMinimum, upperBound)
}

export function computeResponsiveRows({
  rows,
  reservedRows = 0,
  safeMarginRows = 0,
  minRows = 1,
  maxRows,
  ratio,
}: RowBudgetOptions): number {
  const normalizedRows = normalizeTerminalDimension(rows, 0)
  const availableRows = computeAvailableRows({
    rows: normalizedRows,
    reservedRows,
    safeMarginRows,
    minRows: 0,
  })
  const minimumRows = nonNegativeRows(minRows)

  if (availableRows <= 0) return minimumRows > 0 ? 1 : 0

  const ratioRows =
    typeof ratio === 'number' && Number.isFinite(ratio)
      ? Math.floor(normalizedRows * Math.max(0, ratio))
      : availableRows
  const cappedRows =
    typeof maxRows === 'number'
      ? Math.min(ratioRows, nonNegativeRows(maxRows))
      : ratioRows
  const targetRows = Math.min(availableRows, Math.max(1, cappedRows))
  const effectiveMinimum = Math.min(minimumRows, availableRows)

  return Math.max(effectiveMinimum, targetRows)
}
