import { useCallback, useEffect, useRef, useState } from 'react'
import {
  countLineBreaks,
  normalizeLineEndings,
  shouldTreatAsSpecialPaste,
} from '#core/utils/paste'
import type { ClipboardImage } from '#core/utils/image/media'
import type { PromptMode } from './types'
import type {
  PastedImageAttachment,
  PastedTextSegment,
  ResolvedPastedImageAttachment,
} from './pasteTypes'

export type {
  PastedImageAttachment,
  PastedTextSegment,
  ResolvedPastedImageAttachment,
} from './pasteTypes'

const PASTED_TEXT_PLACEHOLDER_PATTERN = /\[Pasted text #\d+(?: \+\d+ lines)?\]/g
const IMAGE_PLACEHOLDER_PATTERN = /\[Image #\d+\]/g
const pastedImageDataStore = new Map<
  string,
  { data: string; mediaType: string; byteLength: number }
>()
let pastedImageStoreId = 1

function estimateBase64ByteLength(data: string): number {
  const normalized = data.replace(/\s/g, '')
  if (normalized.length === 0) return 0
  const padding = normalized.endsWith('==')
    ? 2
    : normalized.endsWith('=')
      ? 1
      : 0
  return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding)
}

export function storePastedImageAttachment(args: {
  image: ClipboardImage
  placeholder: string
}): PastedImageAttachment {
  const id = `pasted-image-${pastedImageStoreId++}`
  const byteLength = estimateBase64ByteLength(args.image.data)

  pastedImageDataStore.set(id, {
    data: args.image.data,
    mediaType: args.image.mediaType,
    byteLength,
  })

  return {
    id,
    placeholder: args.placeholder,
    mediaType: args.image.mediaType,
    byteLength,
  }
}

export function resolvePastedImageAttachments(
  images: PastedImageAttachment[],
): ResolvedPastedImageAttachment[] {
  const resolved: ResolvedPastedImageAttachment[] = []

  for (const image of images) {
    const stored = pastedImageDataStore.get(image.id)
    const legacyData = (image as { data?: unknown }).data
    const data =
      stored?.data ?? (typeof legacyData === 'string' ? legacyData : null)

    if (!data) continue

    resolved.push({
      ...image,
      mediaType: stored?.mediaType ?? image.mediaType,
      byteLength: stored?.byteLength ?? image.byteLength,
      data,
    })
  }

  return resolved
}

export function releasePastedImageAttachments(
  images: PastedImageAttachment[],
): void {
  for (const image of images) {
    pastedImageDataStore.delete(image.id)
  }
}

export function releaseStalePastedImageAttachments(args: {
  previous: PastedImageAttachment[]
  next: PastedImageAttachment[]
}): void {
  if (args.previous.length === 0) return

  const nextIds = new Set(args.next.map(image => image.id))
  const staleImages = args.previous.filter(image => !nextIds.has(image.id))
  releasePastedImageAttachments(staleImages)
}

export function __clearPastedImageDataForTests(): void {
  pastedImageDataStore.clear()
  pastedImageStoreId = 1
}

function collectPlaceholderMatches(
  input: string,
  pattern: RegExp,
): Set<string> {
  const placeholders = new Set<string>()
  for (const match of input.matchAll(pattern)) {
    placeholders.add(match[0])
  }
  return placeholders
}

function arePastedTextSegmentsEqual(
  a: PastedTextSegment[],
  b: PastedTextSegment[],
): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false

  return a.every((item, index) => {
    const other = b[index]
    return other?.placeholder === item.placeholder && other.text === item.text
  })
}

function arePastedImageAttachmentsEqual(
  a: PastedImageAttachment[],
  b: PastedImageAttachment[],
): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false

  return a.every((item, index) => {
    const other = b[index]
    return (
      other?.id === item.id &&
      other?.placeholder === item.placeholder &&
      other.mediaType === item.mediaType &&
      other.byteLength === item.byteLength
    )
  })
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
    next = next.replaceAll(placeholder, text)
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
  terminalColumns: number
}) {
  const {
    cursorOffset,
    input,
    onInputChange,
    onModeChange,
    setCursorOffset,
    terminalRows,
    terminalColumns,
  } = args

  const [pastedTexts, setPastedTextsState] = useState<PastedTextSegment[]>([])
  const [pastedImages, setPastedImagesState] = useState<
    PastedImageAttachment[]
  >([])
  const pastedTextCounter = useRef(1)
  const pastedImageCounter = useRef(1)
  const inputRef = useRef(input)
  const cursorOffsetRef = useRef(cursorOffset)

  useEffect(() => {
    inputRef.current = input
  }, [input])

  useEffect(() => {
    cursorOffsetRef.current = cursorOffset
  }, [cursorOffset])

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

        if (arePastedTextSegmentsEqual(prev, resolved)) return prev
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

        if (arePastedImageAttachmentsEqual(prev, resolved)) return prev
        releaseStalePastedImageAttachments({ previous: prev, next: resolved })
        return resolved
      })
    },
    [],
  )

  const onImagePaste = useCallback(
    (image: ClipboardImage): string => {
      onModeChange('prompt')
      const placeholder = `[Image #${pastedImageCounter.current}]`
      pastedImageCounter.current += 1
      setPastedImages(prev => [
        ...prev,
        storePastedImageAttachment({ image, placeholder }),
      ])
      return placeholder
    },
    [onModeChange, setPastedImages],
  )

  const onTextPaste = useCallback(
    (rawText: string) => {
      const text = normalizeLineEndings(rawText)
      const newlineCount = countLineBreaks(text)
      const currentInput = inputRef.current
      const currentCursorOffset = cursorOffsetRef.current

      if (!shouldTreatAsSpecialPaste(text, { terminalRows, terminalColumns })) {
        const newInput =
          currentInput.slice(0, currentCursorOffset) +
          text +
          currentInput.slice(currentCursorOffset)
        onInputChange(newInput)
        setCursorOffset(currentCursorOffset + text.length)
        return
      }

      const pasteId = pastedTextCounter.current
      pastedTextCounter.current += 1
      const pastedPrompt =
        newlineCount === 0
          ? `[Pasted text #${pasteId}]`
          : `[Pasted text #${pasteId} +${newlineCount} lines]`

      const newInput =
        currentInput.slice(0, currentCursorOffset) +
        pastedPrompt +
        currentInput.slice(currentCursorOffset)
      onInputChange(newInput)
      setCursorOffset(currentCursorOffset + pastedPrompt.length)
      setPastedTexts(prev => [...prev, { placeholder: pastedPrompt, text }])
    },
    [
      onInputChange,
      setCursorOffset,
      setPastedTexts,
      terminalRows,
      terminalColumns,
    ],
  )

  const clearPastes = useCallback(() => {
    setPastedImages([])
    setPastedTexts([])
  }, [])

  useEffect(() => {
    if (pastedTexts.length === 0 && pastedImages.length === 0) return

    const referencedTextPlaceholders =
      pastedTexts.length > 0
        ? collectPlaceholderMatches(input, PASTED_TEXT_PLACEHOLDER_PATTERN)
        : null
    const referencedImagePlaceholders =
      pastedImages.length > 0
        ? collectPlaceholderMatches(input, IMAGE_PLACEHOLDER_PATTERN)
        : null

    setPastedTexts(prev => {
      if (!referencedTextPlaceholders || prev.length === 0) return prev
      return prev.filter(p => referencedTextPlaceholders.has(p.placeholder))
    })
    setPastedImages(prev => {
      if (!referencedImagePlaceholders || prev.length === 0) return prev
      return prev.filter(p => referencedImagePlaceholders.has(p.placeholder))
    })
  }, [input, pastedImages, pastedTexts, setPastedImages, setPastedTexts])

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
