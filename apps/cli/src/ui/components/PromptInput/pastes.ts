import { useCallback, useEffect, useRef, useState } from 'react'
import {
  countLineBreaks,
  normalizeLineEndings,
  shouldTreatAsSpecialPaste,
} from '#core/utils/paste'
import type { PromptMode } from './types'

export type PastedTextSegment = { placeholder: string; text: string }
export type PastedImageAttachment = {
  placeholder: string
  data: string
  mediaType: string
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
  const [pastedTexts, setPastedTexts] = useState<PastedTextSegment[]>([])
  const [pastedImages, setPastedImages] = useState<PastedImageAttachment[]>([])
  const pastedTextCounter = useRef(1)
  const pastedImageCounter = useRef(1)

  const onImagePaste = useCallback(
    (base64Image: string): string => {
      args.onModeChange('prompt')
      const placeholder = `[Image #${pastedImageCounter.current}]`
      pastedImageCounter.current += 1
      setPastedImages(prev => [
        ...prev,
        { placeholder, data: base64Image, mediaType: 'image/png' },
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
