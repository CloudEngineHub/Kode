import type { Key } from '#ui-ink/hooks/useKeypress'

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
   * Optional display override for `value`. When provided, the input will still
   * edit and submit the real `value`, but render `displayValue` instead.
   *
   * Useful for secrets (API keys) to avoid leaking/wrapping long values.
   */
  readonly displayValue?: string

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
   * Optional maximum number of lines to render for the input value.
   * Helps prevent viewport overflow (flicker/ghost lines) on small terminals.
   */
  readonly maxHeight?: number

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
   * Whether to disable cursor movement for up/down arrow keys.
   * Can be a boolean or a function that returns boolean (evaluated at keypress time).
   */
  readonly disableCursorMovementForUpDownKeys?: boolean | (() => boolean)

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
