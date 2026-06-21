import { describe, expect, test } from 'bun:test'
import { Cursor, MeasuredText } from '#cli-utils/Cursor'

describe('Multi-line arrow navigation', () => {
  test('MeasuredText correctly identifies line positions', () => {
    const text = 'line1\nline2\nline3'
    const mt = new MeasuredText(text, 80)

    expect(mt.lineCount).toBe(3)

    // Offset 0: start of line1
    expect(mt.getPositionFromOffset(0).line).toBe(0)

    // Offset 5: end of "line1" (before newline)
    expect(mt.getPositionFromOffset(5).line).toBe(0)

    // Offset 6: start of line2 (after newline)
    expect(mt.getPositionFromOffset(6).line).toBe(1)

    // Offset 11: end of "line2" (before second newline)
    expect(mt.getPositionFromOffset(11).line).toBe(1)

    // Offset 12: start of line3
    expect(mt.getPositionFromOffset(12).line).toBe(2)

    // Offset 17: end of "line3"
    expect(mt.getPositionFromOffset(17).line).toBe(2)
  })

  test('Cursor.up() moves cursor to previous line', () => {
    const text = 'line1\nline2\nline3'
    // Cursor at end of line2 (offset 11)
    const cursor = Cursor.fromText(text, 80, 11)

    const pos = cursor.measuredText.getPositionFromOffset(cursor.offset)
    expect(pos.line).toBe(1)

    const upCursor = cursor.up()
    const upPos = upCursor.measuredText.getPositionFromOffset(upCursor.offset)
    expect(upPos.line).toBe(0)
  })

  test('Cursor.up() on first line returns cursor at offset 0', () => {
    const text = 'line1\nline2\nline3'
    // Cursor in middle of line1 (offset 3)
    const cursor = Cursor.fromText(text, 80, 3)

    const pos = cursor.measuredText.getPositionFromOffset(cursor.offset)
    expect(pos.line).toBe(0)

    const upCursor = cursor.up()
    expect(upCursor.offset).toBe(0)
  })

  test('Cursor.down() moves cursor to next line', () => {
    const text = 'line1\nline2\nline3'
    // Cursor at end of line1 (offset 5)
    const cursor = Cursor.fromText(text, 80, 5)

    const pos = cursor.measuredText.getPositionFromOffset(cursor.offset)
    expect(pos.line).toBe(0)

    const downCursor = cursor.down()
    const downPos = downCursor.measuredText.getPositionFromOffset(
      downCursor.offset,
    )
    expect(downPos.line).toBe(1)
  })

  test('Cursor.down() on last line returns cursor at end', () => {
    const text = 'line1\nline2\nline3'
    // Cursor in middle of line3 (offset 14)
    const cursor = Cursor.fromText(text, 80, 14)

    const pos = cursor.measuredText.getPositionFromOffset(cursor.offset)
    expect(pos.line).toBe(2)
    expect(cursor.measuredText.lineCount - 1).toBe(2) // Last line index

    const downCursor = cursor.down()
    expect(downCursor.offset).toBe(text.length)
  })

  test('Line detection works with wrapped lines', () => {
    // Test with narrow column width causing wrapping
    const text = 'hello world this is a long line'
    const mt = new MeasuredText(text, 10) // 10 columns

    // Should wrap into multiple lines
    expect(mt.lineCount).toBeGreaterThan(1)
  })

  test('Line detection works with explicit newlines and wrapping', () => {
    const text = 'short\nvery long line that will wrap'
    const mt = new MeasuredText(text, 15)

    // Line 0: "short" (explicit newline)
    expect(mt.getPositionFromOffset(0).line).toBe(0)

    // After newline should be on next line
    expect(mt.getPositionFromOffset(6).line).toBe(1)
  })
})

describe('Arrow key navigation logic', () => {
  // Simulate the logic from upOrHistoryUp
  function simulateUpOrHistoryUp(args: {
    text: string
    cursorOffset: number
    columns: number
    disableCursorMovement: boolean
  }): 'history' | 'cursor_move' {
    if (args.disableCursorMovement) {
      return 'history'
    }

    const cursor = Cursor.fromText(args.text, args.columns, args.cursorOffset)
    const { line } = cursor.measuredText.getPositionFromOffset(cursor.offset)

    if (line === 0) {
      return 'history'
    }

    return 'cursor_move'
  }

  function simulateDownOrHistoryDown(args: {
    text: string
    cursorOffset: number
    columns: number
    disableCursorMovement: boolean
  }): 'history' | 'cursor_move' {
    if (args.disableCursorMovement) {
      return 'history'
    }

    const cursor = Cursor.fromText(args.text, args.columns, args.cursorOffset)
    const { line } = cursor.measuredText.getPositionFromOffset(cursor.offset)
    const lastLine = cursor.measuredText.lineCount - 1

    if (line >= lastLine) {
      return 'history'
    }

    return 'cursor_move'
  }

  // Simulate disableCursorMovementForUpDownKeys condition
  function shouldDisableCursorMovement(args: {
    completionActive: boolean
    historyIndex: number
    input: string
    isInFastBrowseMode: boolean
  }): boolean {
    return (
      args.completionActive ||
      args.historyIndex > 0 ||
      !args.input.includes('\n') ||
      args.isInFastBrowseMode
    )
  }

  test('Up arrow on middle line moves cursor (not history)', () => {
    const input = 'line1\nline2\nline3'
    const cursorOffset = 8 // Middle of line2

    const disableCursor = shouldDisableCursorMovement({
      completionActive: false,
      historyIndex: 0,
      input,
      isInFastBrowseMode: false,
    })

    expect(disableCursor).toBe(false)

    const action = simulateUpOrHistoryUp({
      text: input,
      cursorOffset,
      columns: 80,
      disableCursorMovement: disableCursor,
    })

    expect(action).toBe('cursor_move')
  })

  test('Up arrow on first line navigates history', () => {
    const input = 'line1\nline2\nline3'
    const cursorOffset = 3 // Middle of line1 (first line)

    const disableCursor = shouldDisableCursorMovement({
      completionActive: false,
      historyIndex: 0,
      input,
      isInFastBrowseMode: false,
    })

    expect(disableCursor).toBe(false)

    const action = simulateUpOrHistoryUp({
      text: input,
      cursorOffset,
      columns: 80,
      disableCursorMovement: disableCursor,
    })

    expect(action).toBe('history')
  })

  test('Down arrow on middle line moves cursor (not history)', () => {
    const input = 'line1\nline2\nline3'
    const cursorOffset = 8 // Middle of line2

    const disableCursor = shouldDisableCursorMovement({
      completionActive: false,
      historyIndex: 0,
      input,
      isInFastBrowseMode: false,
    })

    expect(disableCursor).toBe(false)

    const action = simulateDownOrHistoryDown({
      text: input,
      cursorOffset,
      columns: 80,
      disableCursorMovement: disableCursor,
    })

    expect(action).toBe('cursor_move')
  })

  test('Down arrow on last line navigates history', () => {
    const input = 'line1\nline2\nline3'
    const cursorOffset = 14 // Middle of line3 (last line)

    const disableCursor = shouldDisableCursorMovement({
      completionActive: false,
      historyIndex: 0,
      input,
      isInFastBrowseMode: false,
    })

    expect(disableCursor).toBe(false)

    const action = simulateDownOrHistoryDown({
      text: input,
      cursorOffset,
      columns: 80,
      disableCursorMovement: disableCursor,
    })

    expect(action).toBe('history')
  })

  test('Single-line input always navigates history', () => {
    const input = 'single line without newlines'
    const cursorOffset = 10

    const disableCursor = shouldDisableCursorMovement({
      completionActive: false,
      historyIndex: 0,
      input,
      isInFastBrowseMode: false,
    })

    expect(disableCursor).toBe(true) // No newlines = disable cursor movement

    const upAction = simulateUpOrHistoryUp({
      text: input,
      cursorOffset,
      columns: 80,
      disableCursorMovement: disableCursor,
    })

    expect(upAction).toBe('history')
  })

  test('Fast browse mode overrides line-based logic', () => {
    const input = 'line1\nline2\nline3'
    const cursorOffset = 8 // Middle of line2

    const disableCursor = shouldDisableCursorMovement({
      completionActive: false,
      historyIndex: 0,
      input,
      isInFastBrowseMode: true, // Fast browse mode enabled
    })

    expect(disableCursor).toBe(true)

    const action = simulateUpOrHistoryUp({
      text: input,
      cursorOffset,
      columns: 80,
      disableCursorMovement: disableCursor,
    })

    expect(action).toBe('history')
  })

  test('Browsing history (historyIndex > 0) always navigates history', () => {
    const input = 'line1\nline2\nline3'
    const cursorOffset = 8 // Middle of line2

    const disableCursor = shouldDisableCursorMovement({
      completionActive: false,
      historyIndex: 1, // Browsing history
      input,
      isInFastBrowseMode: false,
    })

    expect(disableCursor).toBe(true)

    const action = simulateUpOrHistoryUp({
      text: input,
      cursorOffset,
      columns: 80,
      disableCursorMovement: disableCursor,
    })

    expect(action).toBe('history')
  })

  test('Completion active always navigates suggestions (not cursor)', () => {
    const input = 'line1\nline2\nline3'
    const cursorOffset = 8 // Middle of line2

    const disableCursor = shouldDisableCursorMovement({
      completionActive: true, // Completion active
      historyIndex: 0,
      input,
      isInFastBrowseMode: false,
    })

    expect(disableCursor).toBe(true)
  })
})
