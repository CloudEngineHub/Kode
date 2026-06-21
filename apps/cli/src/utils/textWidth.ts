import stringWidth from 'string-width'

const widthCache = new Map<string, number>()
const MAX_CACHE_SIZE = 5000

const locale =
  [process.env.LC_ALL, process.env.LC_CTYPE, process.env.LANG]
    .filter(Boolean)
    .join(' ') || ''
const ambiguousIsNarrow = !/\b(zh|ja|ko)(?:[_-][A-Za-z]+)?/i.test(locale)

export function getCachedStringWidth(text: string): number {
  if (!text) return 0
  if (/^[\x20-\x7E]*$/.test(text)) return text.length

  const cached = widthCache.get(text)
  if (cached !== undefined) return cached

  const width = stringWidth(text, { ambiguousIsNarrow })
  widthCache.set(text, width)

  if (widthCache.size > MAX_CACHE_SIZE) {
    const firstKey = widthCache.keys().next().value
    if (firstKey !== undefined) {
      widthCache.delete(firstKey)
    }
  }

  return width
}

export function clearStringWidthCache(): void {
  widthCache.clear()
}
