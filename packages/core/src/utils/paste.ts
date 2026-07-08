import stringWidth from 'string-width'

export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

export function countLineBreaks(text: string): number {
  return (text.match(/\r\n|\r|\n/g) || []).length
}

export const SPECIAL_PASTE_CHAR_THRESHOLD = 800
export const SPECIAL_PASTE_MAX_INLINE_ROWS = 2

export function getSpecialPasteNewlineThreshold(terminalRows: number): number {
  return Math.max(0, Math.min(terminalRows - 10, 2))
}

export type SpecialPasteOptions = {
  terminalRows?: number
  terminalColumns?: number
  charThreshold?: number
  maxInlineRows?: number
}

function normalizeTerminalColumns(terminalColumns: number | undefined) {
  if (typeof terminalColumns !== 'number') return null
  if (!Number.isFinite(terminalColumns)) return null
  return Math.max(1, Math.floor(terminalColumns))
}

export function estimatePasteWrappedLineCount(
  text: string,
  terminalColumns: number,
): number {
  const columns = normalizeTerminalColumns(terminalColumns)
  if (columns === null) return 1

  const safeColumns = Math.max(1, columns - 1)
  const normalized = normalizeLineEndings(text)
  const lines = normalized.split('\n')
  let count = 0

  for (const line of lines) {
    const width = stringWidth(line)
    count += Math.max(1, Math.ceil(width / safeColumns))
  }

  return count
}

export function shouldTreatAsSpecialPaste(
  text: string,
  options: SpecialPasteOptions = {},
): boolean {
  const normalized = normalizeLineEndings(text)

  const terminalRows = options.terminalRows ?? process.stdout?.rows ?? 24
  const charThreshold = options.charThreshold ?? SPECIAL_PASTE_CHAR_THRESHOLD
  const maxInlineRows = options.maxInlineRows ?? SPECIAL_PASTE_MAX_INLINE_ROWS
  const newlineThreshold = getSpecialPasteNewlineThreshold(terminalRows)

  if (normalized.length > charThreshold) return true

  if (options.terminalColumns !== undefined) {
    const wrappedLineCount = estimatePasteWrappedLineCount(
      normalized,
      options.terminalColumns,
    )
    if (wrappedLineCount > maxInlineRows) return true
  }

  const newlineCount = countLineBreaks(normalized)
  return newlineCount > newlineThreshold
}

export function shouldAggregatePasteChunk(
  input: string,
  hasPendingTimeout: boolean,
  options: SpecialPasteOptions = {},
): boolean {
  // Avoid misclassifying escape-prefixed newline insert sequences from terminal keybindings (e.g. Option+Enter).
  if (input === '\x1b\r' || input === '\x1b\n') return false

  if (shouldTreatAsSpecialPaste(input, options)) return true

  // Multi-line chunks (or CRLF bursts) are usually paste, but may be delivered in smaller batches.
  if (input.length > 1 && (input.includes('\n') || input.includes('\r')))
    return true

  if (hasPendingTimeout && input.length > 1) return true

  return false
}
