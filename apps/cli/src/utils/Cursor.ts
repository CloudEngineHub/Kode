import type { Position } from './Cursor/MeasuredText'
import { MeasuredText } from './Cursor/MeasuredText'
import { getCachedStringWidth } from '#cli-utils/textWidth'

export class Cursor {
  readonly offset: number

  constructor(
    readonly measuredText: MeasuredText,
    offset: number = 0,
    readonly selection: number = 0,
  ) {
    // it's ok for the cursor to be 1 char beyond the end of the string
    const clamped = Math.max(0, Math.min(this.measuredText.text.length, offset))
    this.offset = normalizeOffset(this.measuredText.text, clamped)
  }

  static fromText(
    text: string,
    columns: number,
    offset: number = 0,
    selection: number = 0,
  ): Cursor {
    // make MeasuredText on less than columns width, to account for cursor
    const safeColumns = Math.max(1, columns - 1)
    return new Cursor(new MeasuredText(text, safeColumns), offset, selection)
  }

  render(
    cursorChar: string,
    mask: string,
    invert: (text: string) => string,
    options?: { maxHeight?: number },
  ) {
    const { line, column } = this.getPosition()
    const maskChar = mask ? (mask[0] ?? '') : ''
    const renderedLines = this.measuredText
      .getWrappedText()
      .map((text, currentLine, allLines) => {
        let displayText = text
        if (maskChar) {
          displayText = Array.from(displayText)
            .map(() => maskChar)
            .join('')
        }
        // looking for the line with the cursor
        if (line != currentLine) return displayText

        const cursorIndex = indexForVisualColumn(displayText, column)
        const cursorCharAtIndex = getCharAt(displayText, cursorIndex)
        const before = displayText.slice(0, cursorIndex)
        const after = displayText.slice(cursorIndex + cursorCharAtIndex.length)
        return before + invert(cursorCharAtIndex || cursorChar) + after
      })

    const maxHeight = options?.maxHeight
    if (!maxHeight || maxHeight < 1 || renderedLines.length <= maxHeight) {
      return renderedLines.join('\n')
    }

    const totalLines = renderedLines.length
    const max = Math.max(1, Math.floor(maxHeight))

    // Keep the cursor-visible region in view.
    // Prefer positioning the cursor on the last visible content line.
    if (max < 3) {
      const start = Math.max(0, Math.min(line - (max - 1), totalLines - max))
      return renderedLines.slice(start, start + max).join('\n')
    }

    let contentHeight = max
    let start = Math.max(
      0,
      Math.min(line - (contentHeight - 1), totalLines - contentHeight),
    )

    // Iterate a few times to settle on stable indicator placement/content height.
    for (let i = 0; i < 3; i += 1) {
      const hiddenAbove = start > 0
      const hiddenBelow = start + contentHeight < totalLines
      const indicatorCount = (hiddenAbove ? 1 : 0) + (hiddenBelow ? 1 : 0)
      const nextContentHeight = Math.max(1, max - indicatorCount)
      const nextStart = Math.max(
        0,
        Math.min(
          line - (nextContentHeight - 1),
          totalLines - nextContentHeight,
        ),
      )
      if (nextContentHeight === contentHeight && nextStart === start) {
        break
      }
      contentHeight = nextContentHeight
      start = nextStart
    }

    const hiddenAbove = start > 0
    const hiddenBelow = start + contentHeight < totalLines
    const contentEnd = start + contentHeight

    const outputLines: string[] = []
    if (hiddenAbove) {
      outputLines.push(`... ${start} lines hidden ...`)
    }
    outputLines.push(...renderedLines.slice(start, contentEnd))
    if (hiddenBelow) {
      outputLines.push(`... ${totalLines - contentEnd} lines hidden ...`)
    }
    return outputLines.join('\n')
  }

  left(): Cursor {
    return new Cursor(
      this.measuredText,
      prevCodePointOffset(this.text, this.offset),
    )
  }

  right(): Cursor {
    return new Cursor(
      this.measuredText,
      nextCodePointOffset(this.text, this.offset),
    )
  }

  up(): Cursor {
    const { line, column } = this.getPosition()
    if (line == 0) {
      return new Cursor(this.measuredText, 0, 0)
    }

    const newOffset = this.getOffset({ line: line - 1, column })
    return new Cursor(this.measuredText, newOffset, 0)
  }

  down(): Cursor {
    const { line, column } = this.getPosition()
    if (line >= this.measuredText.lineCount - 1) {
      return new Cursor(this.measuredText, this.text.length, 0)
    }

    const newOffset = this.getOffset({ line: line + 1, column })
    return new Cursor(this.measuredText, newOffset, 0)
  }

  startOfLine(): Cursor {
    const { line } = this.getPosition()
    return new Cursor(
      this.measuredText,
      this.getOffset({
        line,
        column: 0,
      }),
      0,
    )
  }

  endOfLine(): Cursor {
    const { line } = this.getPosition()
    const column = this.measuredText.getLineLength(line)
    const offset = this.getOffset({ line, column })
    return new Cursor(this.measuredText, offset, 0)
  }

  nextWord(): Cursor {
    const text = this.text
    const codePoints = toCodePoints(text)
    let index = offsetToCodePointIndex(text, this.offset)

    if (index >= codePoints.length) {
      return this
    }

    const currentChar = codePoints[index] ?? ''
    if (isWordCharStrict(currentChar)) {
      while (
        index < codePoints.length &&
        isWordCharWithCombining(codePoints[index] ?? '')
      ) {
        const nextChar = codePoints[index + 1]
        if (
          nextChar &&
          isWordCharStrict(nextChar) &&
          isDifferentScript(codePoints[index] ?? '', nextChar)
        ) {
          index += 1
          break
        }
        index += 1
      }
    } else if (!isWhitespace(currentChar)) {
      while (
        index < codePoints.length &&
        !isWordCharStrict(codePoints[index] ?? '') &&
        !isWhitespace(codePoints[index] ?? '')
      ) {
        index += 1
      }
    }

    while (index < codePoints.length && isWhitespace(codePoints[index] ?? '')) {
      index += 1
    }

    const offsets = getCodePointOffsets(text)
    const nextOffset = offsets[index] ?? text.length
    return new Cursor(this.measuredText, nextOffset)
  }

  prevWord(): Cursor {
    const text = this.text
    const codePoints = toCodePoints(text)
    let index = offsetToCodePointIndex(text, this.offset)

    if (index <= 0) {
      return this
    }

    index -= 1

    while (index >= 0 && isWhitespace(codePoints[index] ?? '')) {
      index -= 1
    }

    if (index < 0) {
      return new Cursor(this.measuredText, 0)
    }

    if (isWordCharStrict(codePoints[index] ?? '')) {
      while (index >= 0 && isWordCharWithCombining(codePoints[index] ?? '')) {
        const prevChar = codePoints[index - 1]
        if (
          prevChar &&
          isWordCharStrict(prevChar) &&
          isDifferentScript(prevChar, codePoints[index] ?? '')
        ) {
          break
        }
        index -= 1
      }
      index += 1
    } else {
      while (
        index >= 0 &&
        !isWordCharStrict(codePoints[index] ?? '') &&
        !isWhitespace(codePoints[index] ?? '')
      ) {
        index -= 1
      }
      index += 1
    }

    const offsets = getCodePointOffsets(text)
    const prevOffset = offsets[index] ?? 0
    return new Cursor(this.measuredText, prevOffset)
  }

  private modifyText(end: Cursor, insertString: string = ''): Cursor {
    const startOffset = this.offset
    const endOffset = end.offset

    const newText =
      this.text.slice(0, startOffset) +
      insertString +
      this.text.slice(endOffset)

    return Cursor.fromText(
      newText,
      this.columns,
      startOffset + insertString.length,
    )
  }

  insert(insertString: string): Cursor {
    const newCursor = this.modifyText(this, insertString)
    return newCursor
  }

  del(): Cursor {
    if (this.isAtEnd()) {
      return this
    }
    const nextOffset = nextCodePointOffset(this.text, this.offset)
    if (nextOffset === this.offset) {
      return this
    }
    const newText =
      this.text.slice(0, this.offset) + this.text.slice(nextOffset)
    return Cursor.fromText(newText, this.columns, this.offset)
  }

  backspace(): Cursor {
    if (this.isAtStart()) {
      return this
    }

    // Get the current position
    const currentOffset = this.offset

    // Create a new cursor at the position before the current one
    const leftOffset = prevCodePointOffset(this.text, currentOffset)

    // Create the new text by removing one character
    const newText =
      this.text.slice(0, leftOffset) + this.text.slice(currentOffset)

    // Return a new cursor with the updated text and position
    return Cursor.fromText(newText, this.columns, leftOffset)
  }

  deleteToLineStart(): Cursor {
    return this.startOfLine().modifyText(this)
  }

  deleteToLineEnd(): Cursor {
    // If cursor is on a newline character, delete just that character
    if (this.text[this.offset] === '\n') {
      return this.modifyText(this.right())
    }

    return this.modifyText(this.endOfLine())
  }

  deleteWordBefore(): Cursor {
    if (this.isAtStart()) {
      return this
    }
    return this.prevWord().modifyText(this)
  }

  deleteWordAfter(): Cursor {
    if (this.isAtEnd()) {
      return this
    }

    return this.modifyText(this.nextWord())
  }

  private isOverWordChar(): boolean {
    const currentChar = getCharAt(this.text, this.offset)
    return isWordCharStrict(currentChar)
  }

  equals(other: Cursor): boolean {
    return (
      this.offset === other.offset && this.measuredText == other.measuredText
    )
  }

  private isAtStart(): boolean {
    return this.offset == 0
  }

  private isAtEnd(): boolean {
    return this.offset == this.text.length
  }

  public get text(): string {
    return this.measuredText.text
  }

  private get columns(): number {
    return this.measuredText.columns + 1
  }

  private getPosition(): Position {
    return this.measuredText.getPositionFromOffset(this.offset)
  }

  private getOffset(position: Position): number {
    return this.measuredText.getOffsetFromPosition(position)
  }
}

export { MeasuredText } from './Cursor/MeasuredText'

export function countWrappedLines(
  text: string,
  columns: number,
  maxLines?: number,
): number {
  const safeColumns = Math.max(1, columns - 1)
  const limit =
    typeof maxLines === 'number' && Number.isFinite(maxLines) && maxLines > 0
      ? Math.floor(maxLines)
      : Number.POSITIVE_INFINITY

  let lineWidth = 0
  let lineHasContent = false
  let lineCount = 0

  const flush = () => {
    lineCount += 1
    lineWidth = 0
    lineHasContent = false
  }

  const flushAndMaybeStop = (): boolean => {
    flush()
    return lineCount >= limit
  }

  for (let i = 0; i < text.length; ) {
    const codePoint = text.codePointAt(i)
    if (codePoint === undefined) break
    const char = String.fromCodePoint(codePoint)

    if (char === '\n') {
      if (flushAndMaybeStop()) return lineCount
      i += char.length
      continue
    }

    const charWidth = getCachedStringWidth(char)
    if (lineHasContent && lineWidth + charWidth > safeColumns) {
      if (flushAndMaybeStop()) return lineCount
    }

    lineWidth += charWidth
    lineHasContent = true
    i += char.length
  }

  if (lineHasContent || lineCount === 0 || text.endsWith('\n')) {
    flush()
  }

  return Math.min(lineCount, limit)
}

function getCharAt(text: string, index: number): string {
  if (index < 0 || index >= text.length) return ''
  const codePoint = text.codePointAt(index)
  if (codePoint === undefined) return ''
  return String.fromCodePoint(codePoint)
}

function indexForVisualColumn(text: string, column: number): number {
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

const CODE_POINT_OFFSETS_CACHE = new Map<string, number[]>()
const MAX_CODE_POINT_OFFSETS_CACHE = 200

function getCodePointOffsets(text: string): number[] {
  const cached = CODE_POINT_OFFSETS_CACHE.get(text)
  if (cached) return cached

  const offsets = [0]
  let offset = 0
  for (const codePoint of text) {
    offset += codePoint.length
    offsets.push(offset)
  }

  CODE_POINT_OFFSETS_CACHE.set(text, offsets)
  if (CODE_POINT_OFFSETS_CACHE.size > MAX_CODE_POINT_OFFSETS_CACHE) {
    const firstKey = CODE_POINT_OFFSETS_CACHE.keys().next().value
    if (firstKey !== undefined) {
      CODE_POINT_OFFSETS_CACHE.delete(firstKey)
    }
  }

  return offsets
}

function offsetToCodePointIndex(text: string, offset: number): number {
  const offsets = getCodePointOffsets(text)
  for (let i = 0; i < offsets.length; i += 1) {
    if (offsets[i] === offset) {
      return i
    }
  }
  for (let i = offsets.length - 1; i >= 0; i -= 1) {
    if (offsets[i]! < offset) {
      return i
    }
  }
  return offsets.length - 1
}

function normalizeOffset(text: string, offset: number): number {
  const offsets = getCodePointOffsets(text)
  for (let i = offsets.length - 1; i >= 0; i -= 1) {
    if (offsets[i]! <= offset) {
      return offsets[i]!
    }
  }
  return 0
}

function prevCodePointOffset(text: string, offset: number): number {
  if (offset <= 0) return 0
  const offsets = getCodePointOffsets(text)
  for (let i = offsets.length - 1; i >= 0; i -= 1) {
    if (offsets[i]! < offset) {
      return offsets[i]!
    }
  }
  return 0
}

function nextCodePointOffset(text: string, offset: number): number {
  const offsets = getCodePointOffsets(text)
  for (let i = 0; i < offsets.length; i += 1) {
    if (offsets[i]! > offset) {
      return offsets[i]!
    }
  }
  return offsets[offsets.length - 1] ?? 0
}

function toCodePoints(text: string): string[] {
  return Array.from(text)
}

function isWhitespace(char: string): boolean {
  return /\s/.test(char)
}

function isCombiningMark(char: string): boolean {
  return /\p{M}/u.test(char)
}

function isWordCharStrict(char: string): boolean {
  return /[\w\p{L}\p{N}]/u.test(char)
}

function isWordCharWithCombining(char: string): boolean {
  return isWordCharStrict(char) || isCombiningMark(char)
}

function getCharScript(char: string): string {
  if (/[\p{Script=Latin}]/u.test(char)) return 'latin'
  if (/[\p{Script=Han}]/u.test(char)) return 'han'
  if (/[\p{Script=Arabic}]/u.test(char)) return 'arabic'
  if (/[\p{Script=Hiragana}]/u.test(char)) return 'hiragana'
  if (/[\p{Script=Katakana}]/u.test(char)) return 'katakana'
  if (/[\p{Script=Cyrillic}]/u.test(char)) return 'cyrillic'
  return 'other'
}

function isDifferentScript(char1: string, char2: string): boolean {
  if (!isWordCharStrict(char1) || !isWordCharStrict(char2)) return false
  return getCharScript(char1) !== getCharScript(char2)
}
