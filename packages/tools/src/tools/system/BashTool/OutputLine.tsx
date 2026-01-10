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
    chalk.grey(`Showing last ${maxLines} lines of ${totalLines} total lines`),
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
  if (maxHeight && maxWidth) {
    const coloredText = isError ? chalk.hex(getTheme().error)(trimmed) : trimmed
    return (
      <Box justifyContent="space-between" width="100%">
        <Box flexDirection="row">
          <Text>&nbsp;&nbsp;⎿ &nbsp;</Text>
          <Box flexDirection="column">
            <MaxSizedText
              text={coloredText}
              maxHeight={maxHeight}
              maxWidth={maxWidth}
              overflowDirection="bottom"
            />
          </Box>
        </Box>
      </Box>
    )
  }

  const displayText = verbose ? trimmed : renderTruncatedContent(trimmed, lines)
  return (
    <Box justifyContent="space-between" width="100%">
      <Box flexDirection="row">
        <Text>&nbsp;&nbsp;⎿ &nbsp;</Text>
        <Box flexDirection="column">
          <Text color={isError ? getTheme().error : undefined}>
            {displayText}
          </Text>
        </Box>
      </Box>
    </Box>
  )
}
