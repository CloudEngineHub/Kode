import { Box, Text } from 'ink'
import * as React from 'react'
import { extractTag } from '#core/utils/messages'
import { getTheme } from '#core/utils/theme'

const MAX_RENDERED_LINES = 5

function renderTruncatedContent(
  lines: string[],
  maxLines: number = MAX_RENDERED_LINES,
): { lines: string[]; truncated: boolean; hiddenCount: number } {
  if (lines.length <= maxLines) {
    return { lines, truncated: false, hiddenCount: 0 }
  }
  return {
    lines: lines.slice(-maxLines),
    truncated: true,
    hiddenCount: lines.length - maxLines,
  }
}

export function AssistantBackgroundTaskOutputMessage({
  content,
  verbose = false,
  maxHeight,
}: {
  content: string
  verbose?: boolean
  maxHeight?: number
}): React.ReactNode {
  const message = extractTag(content, 'background-task-output')
  if (!message) {
    return null
  }

  const theme = getTheme()
  const allLines = message.split(/\r?\n/).filter(l => l.trim().length > 0)

  if (allLines.length === 0) {
    return null
  }

  const viewportMaxLines = maxHeight
    ? Math.max(1, Math.floor(maxHeight))
    : undefined
  const maxRenderedLines =
    viewportMaxLines === undefined
      ? MAX_RENDERED_LINES
      : Math.min(MAX_RENDERED_LINES, viewportMaxLines)
  const { lines, truncated, hiddenCount } =
    verbose && viewportMaxLines === undefined
      ? { lines: allLines, truncated: false, hiddenCount: 0 }
      : renderTruncatedContent(
          allLines,
          verbose ? viewportMaxLines : maxRenderedLines,
        )

  return (
    <Box flexDirection="column">
      {truncated && (
        <Box flexDirection="row">
          <Text color={theme.secondaryText}>
            &nbsp;&nbsp;⎿ &nbsp;... {hiddenCount} lines hidden, showing last{' '}
            {lines.length} lines
          </Text>
        </Box>
      )}
      {lines.map((line, index) => (
        <Box key={index} flexDirection="row">
          <Text>
            &nbsp;&nbsp;⎿ &nbsp;
            <Text color={theme.secondaryText}>{line}</Text>
          </Text>
        </Box>
      ))}
    </Box>
  )
}
