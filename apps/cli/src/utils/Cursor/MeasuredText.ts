import { getCachedStringWidth } from '#cli-utils/textWidth'

export type WrappedText = string[]
export type Position = {
  line: number
  column: number
}

class WrappedLine {
  constructor(
    public readonly text: string,
    public readonly startOffset: number,
    public readonly isPrecededByNewline: boolean,
    public readonly endsWithNewline: boolean = false,
  ) {}

  equals(other: WrappedLine): boolean {
    return this.text === other.text && this.startOffset === other.startOffset
  }

  get length(): number {
    return this.text.length + (this.endsWithNewline ? 1 : 0)
  }
}

export class MeasuredText {
  private wrappedLines: WrappedLine[]

  constructor(
    readonly text: string,
    readonly columns: number,
  ) {
    this.wrappedLines = this.measureWrappedText()
  }

  private measureWrappedText(): WrappedLine[] {
    const wrappedLines: WrappedLine[] = []
    const columns = Math.max(1, this.columns)

    let lineStartOffset = 0
    let lineText = ''
    let lineWidth = 0

    const flushLine = (endsWithNewline: boolean) => {
      const startOffset = lineStartOffset
      const isPrecededByNewline =
        startOffset === 0 || this.text[startOffset - 1] === '\n'
      wrappedLines.push(
        new WrappedLine(
          lineText,
          startOffset,
          isPrecededByNewline,
          endsWithNewline,
        ),
      )
      lineText = ''
      lineWidth = 0
    }

    for (let i = 0; i < this.text.length; ) {
      const codePoint = this.text.codePointAt(i)
      if (codePoint === undefined) break
      const char = String.fromCodePoint(codePoint)

      if (char === '\n') {
        flushLine(true)
        i += char.length
        lineStartOffset = i
        continue
      }

      const charWidth = getCachedStringWidth(char)
      if (lineText.length > 0 && lineWidth + charWidth > columns) {
        flushLine(false)
        lineStartOffset = i
      }

      lineText += char
      lineWidth += charWidth
      i += char.length
    }

    if (
      lineText.length > 0 ||
      wrappedLines.length === 0 ||
      this.text.endsWith('\n')
    ) {
      flushLine(false)
    }

    return wrappedLines
  }

  public getWrappedText(): WrappedText {
    return this.wrappedLines.map(line =>
      line.isPrecededByNewline ? line.text : line.text.trimStart(),
    )
  }

  private getLine(line: number): WrappedLine {
    return this.wrappedLines[
      Math.max(0, Math.min(line, this.wrappedLines.length - 1))
    ]!
  }

  public getOffsetFromPosition(position: Position): number {
    const wrappedLine = this.getLine(position.line)
    const { leadingWhitespaceWidth } =
      this.getLeadingWhitespaceInfo(wrappedLine)
    const targetColumn = Math.max(0, position.column + leadingWhitespaceWidth)
    const startOffsetPlusColumn =
      wrappedLine.startOffset +
      this.getOffsetForColumn(wrappedLine.text, targetColumn)

    // Handle blank lines specially
    if (wrappedLine.text.length === 0 && wrappedLine.endsWithNewline) {
      return wrappedLine.startOffset
    }

    // For normal lines
    const lineEnd = wrappedLine.startOffset + wrappedLine.text.length
    // Add 1 only if this line ends with a newline
    const maxOffset = wrappedLine.endsWithNewline ? lineEnd + 1 : lineEnd

    return Math.min(startOffsetPlusColumn, maxOffset)
  }

  public getLineLength(line: number): number {
    const currentLine = this.getLine(line)
    const { leadingWhitespaceWidth } =
      this.getLeadingWhitespaceInfo(currentLine)
    return Math.max(
      0,
      getCachedStringWidth(currentLine.text) - leadingWhitespaceWidth,
    )
  }

  public getPositionFromOffset(offset: number): Position {
    const lines = this.wrappedLines
    for (let line = 0; line < lines.length; line++) {
      const currentLine = lines[line]!
      const nextLine = lines[line + 1]
      if (
        offset >= currentLine.startOffset &&
        (!nextLine || offset < nextLine.startOffset)
      ) {
        const { leadingWhitespaceWidth } =
          this.getLeadingWhitespaceInfo(currentLine)
        const textUpToOffset = this.text.slice(currentLine.startOffset, offset)
        const lineWidth = Math.max(
          0,
          getCachedStringWidth(currentLine.text) - leadingWhitespaceWidth,
        )
        const column = Math.max(
          0,
          Math.min(
            getCachedStringWidth(textUpToOffset) - leadingWhitespaceWidth,
            lineWidth,
          ),
        )
        return {
          line,
          column,
        }
      }
    }

    // If we're past the last character, return the end of the last line
    const line = lines.length - 1
    return {
      line,
      column: this.getLineLength(line),
    }
  }

  public get lineCount(): number {
    return this.wrappedLines.length
  }

  equals(other: MeasuredText): boolean {
    return this.text === other.text && this.columns === other.columns
  }

  private getLeadingWhitespaceInfo(line: WrappedLine): {
    leadingWhitespaceWidth: number
  } {
    if (line.isPrecededByNewline) {
      return { leadingWhitespaceWidth: 0 }
    }
    const trimmed = line.text.trimStart()
    const leading = line.text.slice(0, line.text.length - trimmed.length)
    return { leadingWhitespaceWidth: getCachedStringWidth(leading) }
  }

  private getOffsetForColumn(text: string, column: number): number {
    if (column <= 0) return 0
    let width = 0
    let offset = 0
    for (const char of text) {
      const nextWidth = width + getCachedStringWidth(char)
      if (nextWidth > column) break
      width = nextWidth
      offset += char.length
    }
    return offset
  }
}
