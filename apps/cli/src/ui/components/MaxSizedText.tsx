import React from 'react'
import { Text } from 'ink'
import wrapAnsi from 'wrap-ansi'
import chalk from 'chalk'
import { getCachedStringWidth } from '#cli-utils/textWidth'

type Props = {
  text: string
  maxHeight?: number
  maxWidth: number
  overflowDirection?: 'top' | 'bottom'
}

function wrapPlainText(text: string, width: number): string[] {
  const lines: string[] = []
  const rawLines = text.split('\n')

  for (const rawLine of rawLines) {
    if (rawLine.length === 0) {
      lines.push('')
      continue
    }

    let current = ''
    let currentWidth = 0
    for (const char of rawLine) {
      const charWidth = getCachedStringWidth(char)
      if (currentWidth + charWidth > width && current.length > 0) {
        lines.push(current)
        current = ''
        currentWidth = 0
      }
      current += char
      currentWidth += charWidth
    }
    lines.push(current)
  }

  return lines
}

export function MaxSizedText({
  text,
  maxHeight,
  maxWidth,
  overflowDirection = 'bottom',
}: Props): React.ReactNode {
  const width = Math.max(1, maxWidth)
  const height = maxHeight ?? 0

  if (!height || height < 1) {
    return <Text>{text}</Text>
  }

  const hasAnsi = /\x1b\[[0-9;]*m/.test(text)
  const wrapped = hasAnsi
    ? wrapAnsi(text, width, { hard: true, trim: false })
    : null
  const lines = wrapped ? wrapped.split('\n') : wrapPlainText(text, width)

  if (lines.length <= height) {
    return <Text>{wrapped ?? lines.join('\n')}</Text>
  }

  const indicatorLines = height > 1 ? 1 : 0
  const visibleContentHeight = Math.max(1, height - indicatorLines)
  const hiddenLines = Math.max(0, lines.length - visibleContentHeight)
  const indicator = chalk.dim(`... ${hiddenLines} lines hidden ...`)

  let visibleLines: string[]
  if (overflowDirection === 'top') {
    visibleLines = lines.slice(0, visibleContentHeight)
    return (
      <Text wrap="truncate-end">
        {visibleLines.join('\n')}
        {indicatorLines ? `\n${indicator}` : ''}
      </Text>
    )
  }

  visibleLines = lines.slice(-visibleContentHeight)
  return (
    <Text wrap="truncate-end">
      {indicatorLines ? `${indicator}\n` : ''}
      {visibleLines.join('\n')}
    </Text>
  )
}
