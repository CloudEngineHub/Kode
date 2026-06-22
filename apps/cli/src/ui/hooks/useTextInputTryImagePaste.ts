import type { Cursor } from '#cli-utils/Cursor'
import {
  CLIPBOARD_ERROR_MESSAGE,
  getImageFromClipboard,
} from '#core/utils/imagePaste'
import type { ClipboardImage } from '#core/utils/image/media'

const IMAGE_PLACEHOLDER = '[Image pasted]'

export function tryImagePaste({
  cursor,
  mask,
  onImagePaste,
  onMessage,
  setImagePasteErrorTimeout,
  clearImagePasteErrorTimeout,
}: {
  cursor: Cursor
  mask: string
  onImagePaste?: (image: ClipboardImage) => string | void
  onMessage?: (show: boolean, message?: string) => void
  setImagePasteErrorTimeout: (timeout: NodeJS.Timeout | null) => void
  clearImagePasteErrorTimeout: () => void
}): Cursor {
  if (mask) {
    return cursor
  }

  const image = getImageFromClipboard()
  if (image === null) {
    onMessage?.(true, CLIPBOARD_ERROR_MESSAGE)
    clearImagePasteErrorTimeout()
    setImagePasteErrorTimeout(
      setTimeout(() => {
        onMessage?.(false)
      }, 4000),
    )
    return cursor
  }

  const placeholder = onImagePaste?.(image)
  return cursor.insert(
    typeof placeholder === 'string' ? placeholder : IMAGE_PLACEHOLDER,
  )
}
