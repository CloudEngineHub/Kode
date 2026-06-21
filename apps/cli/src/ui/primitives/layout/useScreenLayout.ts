import { useTerminalSize } from '#ui-ink/hooks/useTerminalSize'

export type ScreenLayout = {
  rows: number
  columns: number
  tightLayout: boolean
  compactLayout: boolean
  paddingX: number
  paddingY: number
  gap: number
}

export function useScreenLayout(
  overrides: Partial<{
    tightRows: number
    tightColumns: number
    compactRows: number
    compactColumns: number
  }> = {},
): ScreenLayout {
  const { rows, columns } = useTerminalSize()

  const tightRows = overrides.tightRows ?? 18
  const tightColumns = overrides.tightColumns ?? 72
  const compactRows = overrides.compactRows ?? 22
  const compactColumns = overrides.compactColumns ?? 92

  const tightLayout = rows <= tightRows || columns <= tightColumns
  const compactLayout =
    tightLayout || rows <= compactRows || columns <= compactColumns

  const paddingY = tightLayout ? 0 : 1
  const gap = tightLayout ? 0 : 1
  const paddingX = tightLayout || compactLayout ? 1 : 2

  return {
    rows,
    columns,
    tightLayout,
    compactLayout,
    paddingX,
    paddingY,
    gap,
  }
}
