export type WebPastedTextSegment = {
  placeholder: string
  text: string
}

export type InsertWebPastedTextResult = {
  input: string
  cursorOffset: number
  segment: WebPastedTextSegment
}

const WEB_PASTE_PLACEHOLDER_PATTERN = /\[Pasted text #\d+(?: \+\d+ lines)?\]/g
const LARGE_WEB_PASTE_MIN_CHARS = 512
const LARGE_WEB_PASTE_MIN_LINES = 2

export function normalizeWebPastedText(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function countLineBreaks(text: string): number {
  let count = 0
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) count += 1
  }
  return count
}

export function shouldFoldWebTextPaste(text: string): boolean {
  const normalized = normalizeWebPastedText(text)
  if (normalized.length >= LARGE_WEB_PASTE_MIN_CHARS) return true
  return countLineBreaks(normalized) >= LARGE_WEB_PASTE_MIN_LINES
}

export function createWebPastedTextPlaceholder(args: {
  id: number
  text: string
}): string {
  const newlineCount = countLineBreaks(normalizeWebPastedText(args.text))
  return newlineCount === 0
    ? `[Pasted text #${args.id}]`
    : `[Pasted text #${args.id} +${newlineCount} lines]`
}

function clampSelectionOffset(offset: number | null, inputLength: number) {
  if (typeof offset !== 'number' || !Number.isFinite(offset)) {
    return inputLength
  }
  return Math.min(Math.max(0, offset), inputLength)
}

export function insertWebPastedTextPlaceholder(args: {
  input: string
  text: string
  id: number
  selectionStart: number | null
  selectionEnd: number | null
}): InsertWebPastedTextResult {
  const text = normalizeWebPastedText(args.text)
  const placeholder = createWebPastedTextPlaceholder({ id: args.id, text })
  const start = clampSelectionOffset(args.selectionStart, args.input.length)
  const end = clampSelectionOffset(args.selectionEnd, args.input.length)
  const from = Math.min(start, end)
  const to = Math.max(start, end)
  const input = args.input.slice(0, from) + placeholder + args.input.slice(to)

  return {
    input,
    cursorOffset: from + placeholder.length,
    segment: {
      placeholder,
      text,
    },
  }
}

export function expandWebPastedTextPlaceholders(args: {
  input: string
  pastedTexts: readonly WebPastedTextSegment[]
}): string {
  let next = args.input
  for (const pasted of args.pastedTexts) {
    if (!next.includes(pasted.placeholder)) continue
    next = next.replaceAll(pasted.placeholder, pasted.text)
  }
  return next
}

export function retainReferencedWebPastedTextSegments(args: {
  input: string
  pastedTexts: readonly WebPastedTextSegment[]
}): WebPastedTextSegment[] {
  if (args.pastedTexts.length === 0) return []

  const referenced = new Set<string>()
  for (const match of args.input.matchAll(WEB_PASTE_PLACEHOLDER_PATTERN)) {
    referenced.add(match[0])
  }

  return args.pastedTexts.filter(pasted => referenced.has(pasted.placeholder))
}
