export type TerminalCell = string

export interface TerminalFrame {
  readonly width: number
  readonly height: number
  readonly cells: readonly TerminalCell[]
}

function assertDimension(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`)
  }
}

function cellIndex(frame: TerminalFrame, x: number, y: number): number {
  if (x < 0 || x >= frame.width || y < 0 || y >= frame.height) {
    throw new Error(`cell out of bounds: ${x},${y}`)
  }

  return y * frame.width + x
}

export function normalizeTerminalCell(value: string): TerminalCell {
  const [first = ' '] = Array.from(value)
  if (/[\u0000-\u001f\u007f]/.test(first)) return ' '
  return first
}

export function createBlankFrame(
  width: number,
  height: number,
  fill = ' ',
): TerminalFrame {
  assertDimension('width', width)
  assertDimension('height', height)

  return {
    width,
    height,
    cells: Array.from({ length: width * height }, () =>
      normalizeTerminalCell(fill),
    ),
  }
}

export function createFrameFromLines(
  lines: readonly string[],
  width: number,
  height: number,
): TerminalFrame {
  const frame = createBlankFrame(width, height)
  const cells = [...frame.cells]

  for (let y = 0; y < height; y += 1) {
    const line = Array.from(lines[y] ?? '')
    for (let x = 0; x < width; x += 1) {
      cells[y * width + x] = normalizeTerminalCell(line[x] ?? ' ')
    }
  }

  return { width, height, cells }
}

export function getFrameCell(
  frame: TerminalFrame,
  x: number,
  y: number,
): TerminalCell {
  return frame.cells[cellIndex(frame, x, y)] ?? ' '
}

export function setFrameCell(
  frame: TerminalFrame,
  x: number,
  y: number,
  value: string,
): TerminalFrame {
  const cells = [...frame.cells]
  cells[cellIndex(frame, x, y)] = normalizeTerminalCell(value)
  return { ...frame, cells }
}

export function frameToLines(frame: TerminalFrame): string[] {
  const lines: string[] = []

  for (let y = 0; y < frame.height; y += 1) {
    const offset = y * frame.width
    lines.push(frame.cells.slice(offset, offset + frame.width).join(''))
  }

  return lines
}

export function framesEqual(
  left: TerminalFrame | null | undefined,
  right: TerminalFrame | null | undefined,
): boolean {
  if (!left || !right) return left === right
  if (left.width !== right.width || left.height !== right.height) return false

  for (let i = 0; i < left.cells.length; i += 1) {
    if (left.cells[i] !== right.cells[i]) return false
  }

  return true
}
