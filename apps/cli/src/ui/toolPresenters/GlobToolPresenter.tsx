import { Box, Text } from 'ink'
import React from 'react'
import { isAbsolute, relative, resolve } from 'path'

import { Cost } from '#ui-ink/components/Cost'
import { FallbackToolUseRejectedMessage } from '#ui-ink/components/FallbackToolUseRejectedMessage'
import { getCwd } from '#core/utils/state'

type Input = { pattern: string; path?: string }

type Output = {
  durationMs: number
  numFiles: number
  filenames: string[]
  truncated: boolean
}

export function renderGlobToolUseMessage(
  { pattern, path }: Input,
  { verbose }: { verbose: boolean },
): string {
  const absolutePath = path
    ? isAbsolute(path)
      ? path
      : resolve(getCwd(), path)
    : undefined
  return `pattern: "${pattern}"${absolutePath ? `, path: "${absolutePath}"` : ''}`
}

export function renderGlobToolUseRejectedMessage(): React.ReactElement {
  return <FallbackToolUseRejectedMessage />
}

export function renderGlobToolResultMessage(output: Output | string) {
  // Handle string content for backward compatibility
  if (typeof output === 'string') {
    output = JSON.parse(output) as Output
  }

  return (
    <Box justifyContent="space-between" width="100%">
      <Box flexDirection="row">
        <Text>&nbsp;&nbsp;⎿ &nbsp;Found </Text>
        <Text bold>{output.numFiles} </Text>
        <Text>
          {output.numFiles === 0 || output.numFiles > 1 ? 'files' : 'file'}
        </Text>
      </Box>
      <Cost costUSD={0} durationMs={output.durationMs} debug={false} />
    </Box>
  )
}
