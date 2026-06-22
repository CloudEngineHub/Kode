import type { Key } from '#ui-ink/hooks/useKeypress'
import type { ClipboardImage } from '#core/utils/image/media'

export type UseTextInputProps = {
  value: string
  onChange: (value: string) => void
  onSubmit?: (value: string) => void
  onExit?: () => void
  onExitMessage?: (show: boolean, key?: string) => void
  onMessage?: (show: boolean, message?: string) => void
  onHistoryUp?: () => void
  onHistoryDown?: () => void
  onHistoryReset?: () => void
  focus?: boolean
  mask?: string
  multiline?: boolean
  cursorChar: string
  highlightPastedText?: boolean
  invert: (text: string) => string
  themeText: (text: string) => string
  columns: number
  maxHeight?: number
  onImagePaste?: (image: ClipboardImage) => string | void
  disableCursorMovementForUpDownKeys?: boolean | (() => boolean)
  externalOffset: number
  onOffsetChange: (offset: number) => void
}

export type UseTextInputResult = {
  renderedValue: string
  onInput: (input: string, key: Key) => void
  offset: number
  setOffset: (offset: number) => void
}
