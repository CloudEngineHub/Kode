import type { NotebookContent } from '#core/types/notebook'

export function getDerivedCellId(index: number): string {
  return `cell-${index}`
}

export function getCellId(
  cell: NotebookContent['cells'][number],
  index: number,
): string {
  return cell.id ?? getDerivedCellId(index)
}

function parseCellIdAsIndex(cellId: string): number | undefined {
  const trimmed = cellId.trim()
  if (/^\d+$/.test(trimmed)) return Number(trimmed)
  const match = trimmed.match(/^cell-(\d+)$/)
  if (match) return Number(match[1])
  return undefined
}

export function findCellIndex(
  notebook: NotebookContent,
  cellId: string,
): number | null {
  const numericIndex = parseCellIdAsIndex(cellId)
  if (numericIndex !== undefined) return numericIndex

  const index = notebook.cells.findIndex(
    (cell, idx) => getCellId(cell, idx) === cellId,
  )
  return index >= 0 ? index : null
}
