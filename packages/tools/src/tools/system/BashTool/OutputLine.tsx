import { Box, Text } from 'ink'
import * as React from 'react'
import { getTheme } from '#core/utils/theme'
import { MAX_RENDERED_LINES } from './prompt'
import chalk from 'chalk'
import { MaxSizedText } from '#ui-ink/components/MaxSizedText'

function renderTruncatedContent(
  content: string,
  totalLines: number,
  maxLines: number = MAX_RENDERED_LINES,
): string {
  const allLines = content.split('\n')
  if (allLines.length <= maxLines) {
    return allLines.join('\n')
  }

  // Show last N lines of output by default
  const lastLines = allLines.slice(-maxLines)
  return [
    chalk.grey(
      `... ${totalLines - maxLines} lines hidden, showing last ${maxLines} lines`,
    ),
    ...lastLines,
  ].join('\n')
}

export function OutputLine({
  content,
  lines,
  verbose,
  isError,
  maxHeight,
  maxWidth,
}: {
  content: string
  lines: number
  verbose: boolean
  isError?: boolean
  maxHeight?: number
  maxWidth?: number
  key?: React.Key
}) {
  const trimmed = content.trim()
  const theme = getTheme()

  if (maxHeight && maxWidth) {
    const coloredText = isError
      ? chalk.hex(theme.error)(trimmed)
      : chalk.dim(trimmed)
    return (
      <Box width="100%" paddingLeft={2}>
        <MaxSizedText
          text={coloredText}
          maxHeight={maxHeight}
          maxWidth={maxWidth}
          overflowDirection="bottom"
        />
      </Box>
    )
  }

  const displayText = verbose ? trimmed : renderTruncatedContent(trimmed, lines)
  return (
    <Box width="100%" paddingLeft={2}>
      <Text color={isError ? theme.error : theme.secondaryText}>
        {displayText}
      </Text>
    </Box>
  )
}
