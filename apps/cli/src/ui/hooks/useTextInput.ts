import { useRef, useState } from 'react'
import { type Key } from '#ui-ink/hooks/useKeypress'
import { useDoublePress } from './useDoublePress'
import { Cursor } from '#cli-utils/Cursor'
import { normalizeLineEndings } from '#core/utils/paste'
import type {
  UseTextInputProps,
  UseTextInputResult,
} from './useTextInput.types'
import { mapInput } from './useTextInputMapping'
import { tryImagePaste } from './useTextInputTryImagePaste'

type MaybeCursor = void | Cursor

// IME (especially CJK) can emit cursor-navigation-like sequences around commits.
// A slightly longer guard helps prevent cursor jumps / wrong insertion points.
const IME_NAVIGATION_GUARD_MS = 150
const IME_ENTER_GUARD_MS = 150

export function useTextInput({
  value: originalValue,
  onChange,
  onSubmit,
  onExit,
  onExitMessage,
  onMessage,
  onHistoryUp,
  onHistoryDown,
  onHistoryReset,
  mask = '',
  multiline = false,
  cursorChar,
  invert,
  columns,
  maxHeight,
  onImagePaste,
  disableCursorMovementForUpDownKeys = false,
  externalOffset,
  onOffsetChange,
}: UseTextInputProps): UseTextInputResult {
  const offset = externalOffset
  const setOffset = onOffsetChange
  const cursorRef = useRef(Cursor.fromText(originalValue, columns, offset))
  const lastComplexInsertRef = useRef(0)
  const lastNonAsciiInsertRef = useRef(0)
  const [imagePasteErrorTimeout, setImagePasteErrorTimeout] =
    useState<NodeJS.Timeout | null>(null)

  // Keep the cursor model in sync with external value/offset/columns updates.
  // Important: avoid recomputing wrapped layout unless the text or column count changed.
  const safeColumns = Math.max(1, columns - 1)
  const currentCursor = cursorRef.current
  if (
    currentCursor.measuredText.text !== originalValue ||
    currentCursor.measuredText.columns !== safeColumns
  ) {
    cursorRef.current = Cursor.fromText(originalValue, columns, offset)
  } else if (currentCursor.offset !== offset) {
    cursorRef.current = new Cursor(currentCursor.measuredText, offset)
  }

  function maybeClearImagePasteErrorTimeout() {
    if (!imagePasteErrorTimeout) {
      return
    }
    clearTimeout(imagePasteErrorTimeout)
    setImagePasteErrorTimeout(null)
    onMessage?.(false)
  }

  function applyCursor(nextCursor: Cursor) {
    const previousCursor = cursorRef.current
    if (previousCursor.equals(nextCursor)) {
      return
    }
    cursorRef.current = nextCursor
    setOffset(nextCursor.offset)
    if (previousCursor.text !== nextCursor.text) {
      onChange(nextCursor.text)
    }
  }

  const handleCtrlC = useDoublePress(
    show => {
      maybeClearImagePasteErrorTimeout()
      onExitMessage?.(show, 'Ctrl-C')
    },
    () => onExit?.(),
    () => {
      if (originalValue) {
        onChange('')
        onHistoryReset?.()
      }
    },
  )

  // Keep Escape for clearing input
  const handleEscape = useDoublePress(
    show => {
      maybeClearImagePasteErrorTimeout()
      onMessage?.(!!originalValue && show, `Press Escape again to clear`)
    },
    () => {
      if (originalValue) {
        onChange('')
      }
    },
  )
  function clear() {
    return Cursor.fromText('', columns, 0)
  }

  const handleEmptyCtrlD = useDoublePress(
    show => onExitMessage?.(show, 'Ctrl-D'),
    () => onExit?.(),
  )

  function handleCtrlD(): MaybeCursor {
    maybeClearImagePasteErrorTimeout()
    const currentCursor = cursorRef.current
    if (currentCursor.text === '') {
      // When input is empty, handle double-press
      handleEmptyCtrlD()
      return currentCursor
    }
    // When input is not empty, delete forward like iPython
    return currentCursor.del()
  }

  function handleImagePaste() {
    return tryImagePaste({
      cursor: cursorRef.current,
      mask,
      onImagePaste,
      onMessage,
      setImagePasteErrorTimeout,
      clearImagePasteErrorTimeout: maybeClearImagePasteErrorTimeout,
    })
  }

  function getCursor(): Cursor {
    return cursorRef.current
  }

  function shouldSuppressNavigation(): boolean {
    const last = lastComplexInsertRef.current
    return last > 0 && Date.now() - last < IME_NAVIGATION_GUARD_MS
  }

  const handleCtrl = mapInput<MaybeCursor>(
    [
      ['a', () => getCursor().startOfLine()],
      ['b', () => getCursor().left()],
      ['c', handleCtrlC],
      ['d', handleCtrlD],
      ['e', () => getCursor().endOfLine()],
      ['f', () => getCursor().right()],
      [
        'h',
        () => {
          maybeClearImagePasteErrorTimeout()
          return getCursor().backspace()
        },
      ],
      ['k', () => getCursor().deleteToLineEnd()],
      ['l', () => clear()],
      ['n', () => downOrHistoryDown()],
      ['p', () => upOrHistoryUp()],
      ['u', () => getCursor().deleteToLineStart()],
      ['v', handleImagePaste],
      ['w', () => getCursor().deleteWordBefore()],
    ],
    () => undefined,
  )

  const handleMeta = mapInput<MaybeCursor>(
    [
      ['b', () => getCursor().prevWord()],
      ['f', () => getCursor().nextWord()],
      ['d', () => getCursor().deleteWordAfter()],
    ],
    () => undefined,
  )

  function handleEnter(key: Key) {
    if (!multiline) {
      onSubmit?.(originalValue)
      return
    }

    // Multiline chat input: Enter submits, Option/Alt+Enter inserts newline.
    const optionPressed = (() => {
      if (!('option' in key)) return false
      const optionValue = (key as unknown as Record<string, unknown>).option
      return optionValue === true
    })()
    if (key.meta || optionPressed) {
      return getCursor().insert('\n')
    }

    // Heuristic IME guard: many CJK IMEs commit text with Enter, which can also
    // reach the app as a Return keypress. If we just inserted non-ASCII text
    // very recently, treat this Enter as "commit" (no-op) rather than submit.
    const now = Date.now()
    if (
      lastNonAsciiInsertRef.current > 0 &&
      now - lastNonAsciiInsertRef.current < IME_ENTER_GUARD_MS
    ) {
      return
    }

    onSubmit?.(originalValue)
  }

  function upOrHistoryUp() {
    if (disableCursorMovementForUpDownKeys) {
      onHistoryUp?.()
      return getCursor()
    }
    const currentCursor = getCursor()
    const cursorUp = currentCursor.up()
    if (cursorUp.equals(currentCursor)) {
      // already at beginning
      onHistoryUp?.()
    }
    return cursorUp
  }
  function downOrHistoryDown() {
    if (disableCursorMovementForUpDownKeys) {
      onHistoryDown?.()
      return getCursor()
    }
    const currentCursor = getCursor()
    const cursorDown = currentCursor.down()
    if (cursorDown.equals(currentCursor)) {
      onHistoryDown?.()
    }
    return cursorDown
  }

  function onInput(input: string, key: Key): void {
    if (key.tab) {
      return // Skip Tab key processing - let completion system handle it
    }

    // Direct handling for backspace or delete (which is being detected as delete)
    if (
      key.backspace ||
      key.delete ||
      input === '\b' ||
      input === '\x7f' ||
      input === '\x08'
    ) {
      applyCursor(getCursor().backspace())
      return
    }

    const isInsertable = key.insertable && !key.ctrl && !key.meta
    if (isInsertable) {
      const now = Date.now()
      const hasNonAscii = /[^\x00-\x7f]/.test(input)
      if (hasNonAscii) {
        lastNonAsciiInsertRef.current = now
      }
      const isComplexInsert = input.length > 1 || hasNonAscii
      if (isComplexInsert) {
        lastComplexInsertRef.current = now
      }
    }

    // Handle paste operations - process large input strings more efficiently
    // This prevents cursor position issues when pasting into masked fields
    if (!key.ctrl && !key.meta && input.length > 1) {
      // Likely a paste operation
      const normalized = normalizeLineEndings(input)
      const insertText = multiline ? normalized : normalized.replace(/\n/g, ' ')
      applyCursor(getCursor().insert(insertText))
      return
    }

    const nextCursor = mapKey(key)(input)
    if (nextCursor) {
      applyCursor(nextCursor)
    }
  }

  function mapKey(key: Key): (input: string) => MaybeCursor {
    // Direct handling for backspace or delete
    if (key.backspace || key.delete) {
      maybeClearImagePasteErrorTimeout()
      return () => getCursor().backspace()
    }

    switch (true) {
      case key.escape:
        return handleEscape
      case key.leftArrow && (key.ctrl || key.meta || ('fn' in key && key.fn)):
        return shouldSuppressNavigation()
          ? () => getCursor()
          : () => getCursor().prevWord()
      case key.rightArrow && (key.ctrl || key.meta || ('fn' in key && key.fn)):
        return shouldSuppressNavigation()
          ? () => getCursor()
          : () => getCursor().nextWord()
      case key.ctrl:
        return handleCtrl
      case 'home' in key && key.home:
        return shouldSuppressNavigation()
          ? () => getCursor()
          : () => getCursor().startOfLine()
      case 'end' in key && key.end:
        return shouldSuppressNavigation()
          ? () => getCursor()
          : () => getCursor().endOfLine()
      case key.pageDown:
        return shouldSuppressNavigation()
          ? () => getCursor()
          : () => getCursor().endOfLine()
      case key.pageUp:
        return shouldSuppressNavigation()
          ? () => getCursor()
          : () => getCursor().startOfLine()
      case key.return:
        return () => handleEnter(key)
      case key.meta:
        return handleMeta
      // Remove Tab handling - let completion system handle it
      case key.upArrow:
        return shouldSuppressNavigation() ? () => getCursor() : upOrHistoryUp
      case key.downArrow:
        return shouldSuppressNavigation()
          ? () => getCursor()
          : downOrHistoryDown
      case key.leftArrow:
        return shouldSuppressNavigation()
          ? () => getCursor()
          : () => getCursor().left()
      case key.rightArrow:
        return shouldSuppressNavigation()
          ? () => getCursor()
          : () => getCursor().right()
    }
    return function (input: string) {
      switch (true) {
        // Home key
        case input == '\x1b[H' || input == '\x1b[1~':
          return getCursor().startOfLine()
        // End key
        case input == '\x1b[F' || input == '\x1b[4~':
          return getCursor().endOfLine()
        // Handle backspace character explicitly - this is the key fix
        case input === '\b' || input === '\x7f' || input === '\x08':
          maybeClearImagePasteErrorTimeout()
          return getCursor().backspace()
        default:
          return getCursor().insert(input.replace(/\r/g, '\n'))
      }
    }
  }

  return {
    onInput,
    renderedValue: cursorRef.current.render(cursorChar, mask, invert, {
      maxHeight,
    }),
    offset,
    setOffset,
  }
}
