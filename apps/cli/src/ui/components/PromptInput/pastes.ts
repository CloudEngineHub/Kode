import { useCallback, useEffect, useRef, useState } from 'react'
import {
  countLineBreaks,
  normalizeLineEndings,
  shouldTreatAsSpecialPaste,
} from '#core/utils/paste'
import type { ClipboardImage } from '#core/utils/image/media'
import type { PromptMode } from './types'

export type PastedTextSegment = { placeholder: string; text: string }
export type PastedImageAttachment = {
  placeholder: string
  data: string
  mediaType: string
}

function extractPastedTextId(placeholder: string): number | null {
  const match = placeholder.match(/\[Pasted text #(\d+)(?: \+\d+ lines)?\]/)
  if (!match?.[1]) return null
  const id = Number(match[1])
  if (!Number.isFinite(id) || id <= 0) return null
  return id
}

function extractImageId(placeholder: string): number | null {
  const match = placeholder.match(/\[Image #(\d+)\]/)
  if (!match?.[1]) return null
  const id = Number(match[1])
  if (!Number.isFinite(id) || id <= 0) return null
  return id
}

export function expandPastedTextPlaceholders(args: {
  input: string
  pastedTexts: PastedTextSegment[]
}): string {
  let next = args.input
  for (const { placeholder, text } of args.pastedTexts) {
    if (!next.includes(placeholder)) continue
    next = next.replace(placeholder, text)
  }
  return next
}

export function usePromptPastes(args: {
  input: string
  cursorOffset: number
  onInputChange: (value: string) => void
  setCursorOffset: (value: number) => void
  onModeChange: (mode: PromptMode) => void
  terminalRows: number
}) {
  const [pastedTexts, setPastedTextsState] = useState<PastedTextSegment[]>([])
  const [pastedImages, setPastedImagesState] = useState<
    PastedImageAttachment[]
  >([])
  const pastedTextCounter = useRef(1)
  const pastedImageCounter = useRef(1)

  const setPastedTexts = useCallback(
    (
      next:
        | PastedTextSegment[]
        | ((prev: PastedTextSegment[]) => PastedTextSegment[]),
    ) => {
      setPastedTextsState(prev => {
        const resolved = typeof next === 'function' ? next(prev) : next

        let maxId = 0
        for (const segment of resolved) {
          const id = extractPastedTextId(segment.placeholder)
          if (id && id > maxId) maxId = id
        }
        if (maxId >= pastedTextCounter.current) {
          pastedTextCounter.current = maxId + 1
        }

        return resolved
      })
    },
    [],
  )

  const setPastedImages = useCallback(
    (
      next:
        | PastedImageAttachment[]
        | ((prev: PastedImageAttachment[]) => PastedImageAttachment[]),
    ) => {
      setPastedImagesState(prev => {
        const resolved = typeof next === 'function' ? next(prev) : next

        let maxId = 0
        for (const segment of resolved) {
          const id = extractImageId(segment.placeholder)
          if (id && id > maxId) maxId = id
        }
        if (maxId >= pastedImageCounter.current) {
          pastedImageCounter.current = maxId + 1
        }

        return resolved
      })
    },
    [],
  )

  const onImagePaste = useCallback(
    (image: ClipboardImage): string => {
      args.onModeChange('prompt')
      const placeholder = `[Image #${pastedImageCounter.current}]`
      pastedImageCounter.current += 1
      setPastedImages(prev => [
        ...prev,
        { placeholder, data: image.data, mediaType: image.mediaType },
      ])
      return placeholder
    },
    [args],
  )

  const onTextPaste = useCallback(
    (rawText: string) => {
      const text = normalizeLineEndings(rawText)
      const newlineCount = countLineBreaks(text)

      if (
        !shouldTreatAsSpecialPaste(text, { terminalRows: args.terminalRows })
      ) {
        const newInput =
          args.input.slice(0, args.cursorOffset) +
          text +
          args.input.slice(args.cursorOffset)
        args.onInputChange(newInput)
        args.setCursorOffset(args.cursorOffset + text.length)
        return
      }

      const pasteId = pastedTextCounter.current
      pastedTextCounter.current += 1
      const pastedPrompt =
        newlineCount === 0
          ? `[Pasted text #${pasteId}]`
          : `[Pasted text #${pasteId} +${newlineCount} lines]`

      const newInput =
        args.input.slice(0, args.cursorOffset) +
        pastedPrompt +
        args.input.slice(args.cursorOffset)
      args.onInputChange(newInput)
      args.setCursorOffset(args.cursorOffset + pastedPrompt.length)
      setPastedTexts(prev => [...prev, { placeholder: pastedPrompt, text }])
    },
    [args],
  )

  const clearPastes = useCallback(() => {
    setPastedImages([])
    setPastedTexts([])
  }, [])

  useEffect(() => {
    setPastedTexts(prev => prev.filter(p => args.input.includes(p.placeholder)))
    setPastedImages(prev =>
      prev.filter(p => args.input.includes(p.placeholder)),
    )
  }, [args.input])

  return {
    pastedTexts,
    pastedImages,
    setPastedTexts,
    setPastedImages,
    onImagePaste,
    onTextPaste,
    clearPastes,
  }
}
