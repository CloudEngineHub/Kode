import type { Cursor } from '#cli-utils/Cursor'
import {
  CLIPBOARD_ERROR_MESSAGE,
  getImageFromClipboard,
  getImageFromClipboardAsync,
} from '#core/utils/imagePaste'
import type { ClipboardImage } from '#core/utils/image/media'

const IMAGE_PLACEHOLDER = '[Image pasted]'

export function tryImagePaste({
  cursor,
  mask,
  onImagePaste,
  onMessage,
  clearImagePasteErrorTimeout,
  scheduleImagePasteErrorClear,
}: {
  cursor: Cursor
  mask: string
  onImagePaste?: (image: ClipboardImage) => string | void
  onMessage?: (show: boolean, message?: string) => void
  clearImagePasteErrorTimeout: () => void
  scheduleImagePasteErrorClear: () => void
}): Cursor {
  if (mask) {
    return cursor
  }

  const image = getImageFromClipboard()
  if (image === null) {
    onMessage?.(true, CLIPBOARD_ERROR_MESSAGE)
    clearImagePasteErrorTimeout()
    scheduleImagePasteErrorClear()
    return cursor
  }

  const placeholder = onImagePaste?.(image)
  return cursor.insert(
    typeof placeholder === 'string' ? placeholder : IMAGE_PLACEHOLDER,
  )
}

export async function resolveImagePastePlaceholder({
  mask,
  onImagePaste,
  onMessage,
  clearImagePasteErrorTimeout,
  scheduleImagePasteErrorClear,
}: {
  mask: string
  onImagePaste?: (image: ClipboardImage) => string | void
  onMessage?: (show: boolean, message?: string) => void
  clearImagePasteErrorTimeout: () => void
  scheduleImagePasteErrorClear: () => void
}): Promise<string | null> {
  if (mask) {
    return null
  }

  onMessage?.(true, 'Reading image from clipboard...')
  const image = await getImageFromClipboardAsync()
  if (image === null) {
    onMessage?.(true, CLIPBOARD_ERROR_MESSAGE)
    clearImagePasteErrorTimeout()
    scheduleImagePasteErrorClear()
    return null
  }

  onMessage?.(false)
  const placeholder = onImagePaste?.(image)
  return typeof placeholder === 'string' ? placeholder : IMAGE_PLACEHOLDER
}
