import type { Cursor } from '#cli-utils/Cursor'
import {
  CLIPBOARD_ERROR_MESSAGE,
  getImageFromClipboard,
} from '#core/utils/imagePaste'

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
  onImagePaste?: (base64Image: string) => string | void
  onMessage?: (show: boolean, message?: string) => void
  setImagePasteErrorTimeout: (timeout: NodeJS.Timeout | null) => void
  clearImagePasteErrorTimeout: () => void
}): Cursor {
  if (mask) {
    return cursor
  }

  const base64Image = getImageFromClipboard()
  if (base64Image === null) {
    if (process.platform !== 'darwin') {
      return cursor
    }
    onMessage?.(true, CLIPBOARD_ERROR_MESSAGE)
    clearImagePasteErrorTimeout()
    setImagePasteErrorTimeout(
      setTimeout(() => {
        onMessage?.(false)
      }, 4000),
    )
    return cursor
  }

  const placeholder = onImagePaste?.(base64Image)
  return cursor.insert(
    typeof placeholder === 'string' ? placeholder : IMAGE_PLACEHOLDER,
  )
}
