import React from 'react'
import { Text, useInput } from 'ink'
import chalk from 'chalk'
import { useTextInput } from '@hooks/useTextInput'
import { getTheme } from '@utils/theme'
import { type Key } from 'ink'

const BRACKETED_PASTE_ENABLE = '\x1b[?2004h'
const BRACKETED_PASTE_DISABLE = '\x1b[?2004l'
const BRACKETED_PASTE_START = '\x1b[200~'
const BRACKETED_PASTE_END = '\x1b[201~'

let bracketedPasteRefCount = 0

function setBracketedPasteEnabled(enabled: boolean) {
  if (!process.stdout?.isTTY) return
  process.stdout.write(enabled ? BRACKETED_PASTE_ENABLE : BRACKETED_PASTE_DISABLE)
}

function acquireBracketedPasteMode() {
  if (bracketedPasteRefCount === 0) {
    setBracketedPasteEnabled(true)
  }
  bracketedPasteRefCount++
}

function releaseBracketedPasteMode() {
  bracketedPasteRefCount = Math.max(0, bracketedPasteRefCount - 1)
  if (bracketedPasteRefCount === 0) {
    setBracketedPasteEnabled(false)
  }
}

function normalizePasteText(text: string): string {
  // Match useTextInput behavior (convert CR to LF)
  return text.replace(/\r/g, '\n')
}

function looksLikeMultiPathPaste(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (!/\s/.test(trimmed)) return false

  const tokens = trimmed.split(/\s+/).filter(Boolean)
  if (tokens.length < 2) return false

  const looksLikePathToken = (token: string) => {
    if (!token) return false
    if (/^[a-zA-Z]:[\\/]/.test(token)) return true
    if (token.startsWith('/') || token.startsWith('./') || token.startsWith('../')) return true
    if (token.includes('/') || token.includes('\\')) return true
    return false
  }

  return tokens.every(looksLikePathToken)
}

function shouldTreatAsSpecialPaste(text: string): boolean {
  const normalized = normalizePasteText(text)
  if (normalized.includes('\n')) return true
  if (normalized.length > 800) return true
  if (looksLikeMultiPathPaste(normalized)) return true
  return false
}

export type Props = {
  /**
   * Optional callback for handling history navigation on up arrow at start of input
   */
  readonly onHistoryUp?: () => void

  /**
   * Optional callback for handling history navigation on down arrow at end of input
   */
  readonly onHistoryDown?: () => void

  /**
   * Text to display when `value` is empty.
   */
  readonly placeholder?: string

  /**
   * Allow multi-line input via line ending with backslash (default: `true`)
   */
  readonly multiline?: boolean

  /**
   * Listen to user's input. Useful in case there are multiple input components
   * at the same time and input must be "routed" to a specific component.
   */
  readonly focus?: boolean

  /**
   * Replace all chars and mask the value. Useful for password inputs.
   */
  readonly mask?: string

  /**
   * Whether to show cursor and allow navigation inside text input with arrow keys.
   */
  readonly showCursor?: boolean

  /**
   * Highlight pasted text
   */
  readonly highlightPastedText?: boolean

  /**
   * Value to display in a text input.
   */
  readonly value: string

  /**
   * Function to call when value updates.
   */
  readonly onChange: (value: string) => void

  /**
   * Function to call when `Enter` is pressed, where first argument is a value of the input.
   */
  readonly onSubmit?: (value: string) => void

  /**
   * Function to call when Ctrl+C is pressed to exit.
   */
  readonly onExit?: () => void

  /**
   * Optional callback to show exit message
   */
  readonly onExitMessage?: (show: boolean, key?: string) => void

  /**
   * Optional callback to show custom message
   */
  readonly onMessage?: (show: boolean, message?: string) => void

  /**
   * Optional callback to reset history position
   */
  readonly onHistoryReset?: () => void

  /**
   * Number of columns to wrap text at
   */
  readonly columns: number

  /**
   * Optional callback when an image is pasted
   */
  readonly onImagePaste?: (base64Image: string) => string | void

  /**
   * Optional callback when a large text (over 800 chars) is pasted
   */
  readonly onPaste?: (text: string) => void

  /**
   * Whether the input is dimmed and non-interactive
   */
  readonly isDimmed?: boolean

  /**
   * Whether to disable cursor movement for up/down arrow keys
   */
  readonly disableCursorMovementForUpDownKeys?: boolean
  
  /**
   * Optional callback to handle special key combinations before input processing
   * Return true to prevent default handling
   */
  readonly onSpecialKey?: (input: string, key: Key) => boolean

  readonly cursorOffset: number

  /**
   * Callback to set the offset of the cursor
   */
  onChangeCursorOffset: (offset: number) => void
}

export default function TextInput({
  value: originalValue,
  placeholder = '',
  focus = true,
  mask,
  multiline = false,
  highlightPastedText = false,
  showCursor = true,
  onChange,
  onSubmit,
  onExit,
  onHistoryUp,
  onHistoryDown,
  onExitMessage,
  onMessage,
  onHistoryReset,
  columns,
  onImagePaste,
  onPaste,
  isDimmed = false,
  disableCursorMovementForUpDownKeys = false,
  onSpecialKey,
  cursorOffset,
  onChangeCursorOffset,
}: Props) {
  const { onInput, renderedValue } = useTextInput({
    value: originalValue,
    onChange,
    onSubmit,
    onExit,
    onExitMessage,
    onMessage,
    onHistoryReset,
    onHistoryUp,
    onHistoryDown,
    focus,
    mask,
    multiline,
    cursorChar: showCursor ? ' ' : '',
    highlightPastedText,
    invert: chalk.inverse,
    themeText: (text: string) => chalk.hex(getTheme().text)(text),
    columns,
    onImagePaste,
    disableCursorMovementForUpDownKeys,
    externalOffset: cursorOffset,
    onOffsetChange: onChangeCursorOffset,
  })

  React.useEffect(() => {
    acquireBracketedPasteMode()
    return () => releaseBracketedPasteMode()
  }, [])

  // Paste detection state
  const [pasteState, setPasteState] = React.useState<{
    chunks: string[]
    timeoutId: ReturnType<typeof setTimeout> | null
  }>({ chunks: [], timeoutId: null })

  const bracketedPasteState = React.useRef<{
    mode: 'normal' | 'in_paste'
    incomplete: string
    buffer: string
  }>({ mode: 'normal', incomplete: '', buffer: '' })

  const flushBracketedPasteBuffer = (rawText: string) => {
    const normalized = normalizePasteText(rawText)
    if (onPaste && shouldTreatAsSpecialPaste(normalized)) {
      // Schedule callback after current render to avoid state updates during render
      Promise.resolve().then(() => onPaste(normalized))
      return
    }

    // Normal paste: insert directly into input.
    onInput(normalized, {} as Key)
  }

  const longestSuffixPrefix = (haystack: string, needle: string): number => {
    const max = Math.min(haystack.length, needle.length - 1)
    for (let len = max; len > 0; len--) {
      if (haystack.endsWith(needle.slice(0, len))) return len
    }
    return 0
  }

  const handleBracketedPasteSequences = (input: string): boolean => {
    const state = bracketedPasteState.current
    let handledAny = false
    let data = state.incomplete + input
    state.incomplete = ''

    while (data) {
      if (state.mode === 'normal') {
        const startIndex = data.indexOf(BRACKETED_PASTE_START)
        if (startIndex === -1) {
          const keep = longestSuffixPrefix(data, BRACKETED_PASTE_START)
          if (keep === 0) {
            if (!handledAny) {
              return false
            }
            onInput(data, {} as Key)
            return true
          }

          const toInsert = data.slice(0, -keep)
          if (toInsert) {
            onInput(toInsert, {} as Key)
          }
          state.incomplete = data.slice(-keep)
          handledAny = true
          return true
        }

        const before = data.slice(0, startIndex)
        if (before) {
          onInput(before, {} as Key)
        }

        data = data.slice(startIndex + BRACKETED_PASTE_START.length)
        state.mode = 'in_paste'
        handledAny = true
        continue
      }

      const endIndex = data.indexOf(BRACKETED_PASTE_END)
      if (endIndex === -1) {
        const keep = longestSuffixPrefix(data, BRACKETED_PASTE_END)
        const content = keep > 0 ? data.slice(0, -keep) : data
        if (content) {
          state.buffer += content
        }
        if (keep > 0) {
          state.incomplete = data.slice(-keep)
        }
        handledAny = true
        return true
      }

      state.buffer += data.slice(0, endIndex)
      const completedPaste = state.buffer
      state.buffer = ''
      state.mode = 'normal'

      flushBracketedPasteBuffer(completedPaste)

      data = data.slice(endIndex + BRACKETED_PASTE_END.length)
      handledAny = true
      continue
    }

    return true
  }

  const resetPasteTimeout = (
    currentTimeoutId: ReturnType<typeof setTimeout> | null,
  ) => {
    if (currentTimeoutId) {
      clearTimeout(currentTimeoutId)
    }
    return setTimeout(() => {
      setPasteState(({ chunks }) => {
        const pastedText = chunks.join('')
        // Schedule callback after current render to avoid state updates during render
        Promise.resolve().then(() => onPaste!(pastedText))
        return { chunks: [], timeoutId: null }
      })
    }, 100)
  }

  const wrappedOnInput = (input: string, key: Key): void => {
    // Check for special key combinations first
    if (onSpecialKey && onSpecialKey(input, key)) {
      // Special key was handled, don't process further
      return
    }
    
    // Special handling for backspace or delete
    if (
      key.backspace ||
      key.delete ||
      input === '\b' ||
      input === '\x7f' ||
      input === '\x08'
    ) {
      // Ensure backspace is handled directly
      onInput(input, {
        ...key,
        backspace: true,
      })
      return
    }

    // Bracketed paste mode: consume sequences and emit either special paste callback or normal insertion
    if (input && handleBracketedPasteSequences(input)) {
      return
    }

    // Handle pastes (>800 chars)
    // Usually we get one or two input characters at a time. If we
    // get a bunch, the user has probably pasted.
    // Unfortunately node batches long pastes, so it's possible
    // that we would see e.g. 1024 characters and then just a few
    // more in the next frame that belong with the original paste.
    // This batching number is not consistent.
    if (onPaste && (input.length > 800 || input.includes('\n') || input.includes('\r') || pasteState.timeoutId)) {
      setPasteState(({ chunks, timeoutId }) => {
        return {
          chunks: [...chunks, input],
          timeoutId: resetPasteTimeout(timeoutId),
        }
      })
      return
    }

    onInput(input, key)
  }

  useInput(wrappedOnInput, { isActive: focus })

  let renderedPlaceholder = placeholder
    ? chalk.hex(getTheme().secondaryText)(placeholder)
    : undefined

  // Fake mouse cursor, because we like punishment
  if (showCursor && focus) {
    renderedPlaceholder =
      placeholder.length > 0
        ? chalk.inverse(placeholder[0]) +
          chalk.hex(getTheme().secondaryText)(placeholder.slice(1))
        : chalk.inverse(' ')
  }

  const showPlaceholder = originalValue.length == 0 && placeholder
  return (
    <Text wrap="truncate-end" dimColor={isDimmed}>
      {showPlaceholder ? renderedPlaceholder : renderedValue}
    </Text>
  )
}
