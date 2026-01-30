import { Box, Text } from 'ink'
import { OutputLine } from './OutputLine'
import React from 'react'
import { getTheme } from '#core/utils/theme'
import { Out as BashOut } from './BashTool'
import { stripSandboxViolations } from '#runtime/shell/sandboxViolations'

type Props = {
  content: Omit<BashOut, 'interrupted'>
  verbose: boolean
  maxHeight?: number
  maxWidth?: number
}

function BashToolResultMessage({
  content,
  verbose,
  maxHeight,
  maxWidth,
}: Props): React.JSX.Element {
  const { stdout, stdoutLines, stderr, stderrLines, bashId } = content
  const cleanedStderr = stripSandboxViolations(stderr)
  const cleanedStderrLines =
    cleanedStderr === stderr
      ? stderrLines
      : cleanedStderr
        ? cleanedStderr.split(/\r?\n/).length
        : 0
  const outputSections = [stdout, cleanedStderr].filter(
    section => section !== '',
  ).length
  const reservedLines = bashId ? 1 : 0
  const availableHeight =
    maxHeight && maxHeight > 0
      ? Math.max(1, maxHeight - reservedLines)
      : undefined
  const perSectionHeight =
    availableHeight && outputSections > 0
      ? Math.max(1, Math.floor(availableHeight / outputSections))
      : undefined

  const theme = getTheme()

  return (
    <Box flexDirection="column">
      {bashId ? (
        <Box paddingLeft={2}>
          <Text color={theme.secondaryText}>(background task: {bashId})</Text>
        </Box>
      ) : null}
      {stdout !== '' ? (
        <OutputLine
          content={stdout}
          lines={stdoutLines}
          verbose={verbose}
          maxHeight={perSectionHeight}
          maxWidth={maxWidth}
        />
      ) : null}
      {cleanedStderr !== '' ? (
        <OutputLine
          content={cleanedStderr}
          lines={cleanedStderrLines}
          verbose={verbose}
          isError
          maxHeight={perSectionHeight}
          maxWidth={maxWidth}
        />
      ) : null}
      {stdout === '' && stderr === '' ? (
        <Box paddingLeft={2}>
          <Text color={theme.secondaryText}>[no output /]</Text>
        </Box>
      ) : null}
    </Box>
  )
}

export default BashToolResultMessage
