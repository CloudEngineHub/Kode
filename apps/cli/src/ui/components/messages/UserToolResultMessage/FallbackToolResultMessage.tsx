import { Box, Text } from 'ink'
import * as React from 'react'
import { getTheme } from '#core/utils/theme'
import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'

const MAX_FALLBACK_CONTENT_LINES = 10

function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trimEnd()
}

function truncateContent(content: string): string {
  const lines = normalizeLineEndings(content).split('\n')
  if (lines.length <= MAX_FALLBACK_CONTENT_LINES) {
    return lines.join('\n')
  }

  return [...lines.slice(0, MAX_FALLBACK_CONTENT_LINES - 1), '...'].join('\n')
}

function indentContent(content: string): string {
  return content
    .split('\n')
    .map(line => `  ${line}`)
    .join('\n')
}

type Props = {
  content: ToolResultBlockParam['content']
  verbose: boolean
}

export function FallbackToolResultMessage({
  content,
  verbose,
}: Props): React.ReactNode {
  const textContent =
    typeof content === 'string'
      ? verbose
        ? normalizeLineEndings(content)
        : truncateContent(content)
      : null

  return (
    <Box flexDirection="column">
      <Text color={getTheme().secondaryText}> Tool result unavailable</Text>
      {textContent ? (
        <Text wrap="wrap">{indentContent(textContent)}</Text>
      ) : null}
    </Box>
  )
}
