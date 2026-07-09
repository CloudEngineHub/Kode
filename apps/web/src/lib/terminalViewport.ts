export type TerminalViewportMetrics = {
  width: number
  height: number
}

export type TerminalViewportSize = {
  cols: number
  rows: number
}

const TERMINAL_CELL_WIDTH_PX = 8
const TERMINAL_CELL_HEIGHT_PX = 24
const MIN_TERMINAL_COLS = 24
const MIN_TERMINAL_ROWS = 6

export function estimateTerminalViewportSize(
  metrics: TerminalViewportMetrics,
): TerminalViewportSize | null {
  if (
    !Number.isFinite(metrics.width) ||
    !Number.isFinite(metrics.height) ||
    metrics.width <= 0 ||
    metrics.height <= 0
  ) {
    return null
  }

  return {
    cols: Math.max(
      MIN_TERMINAL_COLS,
      Math.floor(metrics.width / TERMINAL_CELL_WIDTH_PX),
    ),
    rows: Math.max(
      MIN_TERMINAL_ROWS,
      Math.floor(metrics.height / TERMINAL_CELL_HEIGHT_PX),
    ),
  }
}

export function isSameTerminalViewportSize(
  left: TerminalViewportSize | null,
  right: TerminalViewportSize | null,
): boolean {
  return left?.cols === right?.cols && left?.rows === right?.rows
}
