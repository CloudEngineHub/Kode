import React, { useMemo } from 'react'
import { Text } from 'ink'
import chalk from 'chalk'
import { wrapLines } from '#ui-ink/primitives/text/wrapLines'

type Props = {
  text: string
  maxHeight?: number
  maxWidth: number
  overflowDirection?: 'top' | 'bottom'
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

  return (
    <BoundedMaxSizedText
      text={text}
      height={height}
      width={width}
      overflowDirection={overflowDirection}
    />
  )
}

function BoundedMaxSizedText({
  text,
  height,
  width,
  overflowDirection,
}: {
  text: string
  height: number
  width: number
  overflowDirection: 'top' | 'bottom'
}): React.ReactNode {
  const lines = useMemo(() => wrapLines(text.split('\n'), width), [text, width])
  const wrapped = lines.join('\n')

  if (lines.length <= height) {
    return <Text>{wrapped}</Text>
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
