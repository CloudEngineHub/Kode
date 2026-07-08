import {
  frameToLines,
  framesEqual,
  getFrameCell,
  type TerminalFrame,
} from './frame'

export interface FrameDiffRun {
  readonly row: number
  readonly column: number
  readonly text: string
}

function sameDimensions(
  previous: TerminalFrame | null | undefined,
  next: TerminalFrame,
): previous is TerminalFrame {
  return (
    !!previous &&
    previous.width === next.width &&
    previous.height === next.height
  )
}

function fullFrameRuns(frame: TerminalFrame): FrameDiffRun[] {
  return frameToLines(frame).map((text, row) => ({
    row,
    column: 0,
    text,
  }))
}

export function diffTerminalFrames(
  previous: TerminalFrame | null | undefined,
  next: TerminalFrame,
): FrameDiffRun[] {
  if (!sameDimensions(previous, next)) return fullFrameRuns(next)
  if (framesEqual(previous, next)) return []

  const runs: FrameDiffRun[] = []

  for (let row = 0; row < next.height; row += 1) {
    let column = 0

    while (column < next.width) {
      if (
        getFrameCell(previous, column, row) === getFrameCell(next, column, row)
      ) {
        column += 1
        continue
      }

      const startColumn = column
      let text = ''

      while (
        column < next.width &&
        getFrameCell(previous, column, row) !== getFrameCell(next, column, row)
      ) {
        text += getFrameCell(next, column, row)
        column += 1
      }

      runs.push({
        row,
        column: startColumn,
        text,
      })
    }
  }

  return runs
}

export function renderAnsiFrameDiff(
  previous: TerminalFrame | null | undefined,
  next: TerminalFrame,
): string {
  return diffTerminalFrames(previous, next)
    .map(run => `\x1b[${run.row + 1};${run.column + 1}H${run.text}`)
    .join('')
}
