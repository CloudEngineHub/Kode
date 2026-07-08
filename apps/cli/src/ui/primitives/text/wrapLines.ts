import wrapAnsi from 'wrap-ansi'
import { getCachedStringWidth } from '#cli-utils/textWidth'

const ANSI_PATTERN = /\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/

export function wrapLines(lines: string[], width: number): string[] {
  const safeWidth = Math.max(1, width)
  const result: string[] = []

  for (const rawLine of lines) {
    if (rawLine.length === 0) {
      result.push('')
      continue
    }

    if (ANSI_PATTERN.test(rawLine)) {
      result.push(
        ...wrapAnsi(rawLine, safeWidth, { hard: true, trim: false }).split(
          '\n',
        ),
      )
      continue
    }

    let current = ''
    let currentWidth = 0

    for (const char of rawLine) {
      const charWidth = getCachedStringWidth(char)
      if (currentWidth + charWidth > safeWidth && current.length > 0) {
        result.push(current)
        current = ''
        currentWidth = 0
      }

      current += char
      currentWidth += charWidth
    }

    result.push(current)
  }

  return result
}
