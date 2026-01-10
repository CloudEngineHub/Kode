import { Box, Text } from 'ink'
import { OutputLine } from './OutputLine'
import React from 'react'
import { getTheme } from '#core/utils/theme'
import { Out as BashOut } from './BashTool'

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
  const outputSections = [stdout, stderr].filter(
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

  return (
    <Box flexDirection="column">
      {bashId ? (
        <Box flexDirection="row">
          <Text>&nbsp;&nbsp;⎿ &nbsp;</Text>
          <Text color={getTheme().secondaryText}>
            Background bash_id: {bashId}
          </Text>
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
      {stderr !== '' ? (
        <OutputLine
          content={stderr}
          lines={stderrLines}
          verbose={verbose}
          isError
          maxHeight={perSectionHeight}
          maxWidth={maxWidth}
        />
      ) : null}
      {stdout === '' && stderr === '' ? (
        <Box flexDirection="row">
          <Text>&nbsp;&nbsp;⎿ &nbsp;</Text>
          <Text color={getTheme().secondaryText}>(No content)</Text>
        </Box>
      ) : null}
    </Box>
  )
}

export default BashToolResultMessage
