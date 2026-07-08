import React from 'react'
import { TextBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import { Box, Text } from 'ink'
import { getTheme } from '#core/utils/theme'
import { logError } from '#core/utils/log'
import { useTerminalSize } from '#ui-ink/hooks/useTerminalSize'
import { computeAvailableColumns } from '#ui-ink/primitives/layout/viewportColumns'

type Props = {
  addMargin: boolean
  param: TextBlockParam
}

export function UserPromptMessage({
  addMargin,
  param: { text },
}: Props): React.ReactNode {
  const { columns } = useTerminalSize()
  const contentWidth = computeAvailableColumns({
    columns,
    reservedColumns: 4,
  })
  if (!text) {
    logError('No content found in user prompt message')
    return null
  }

  const theme = getTheme()
  return (
    <Box flexDirection="row" marginTop={addMargin ? 1 : 0} width="100%">
      <Box minWidth={2} width={2}>
        <Text color={theme.kode} bold>
          {'\u276F'}
        </Text>
      </Box>
      <Box flexDirection="column" width={contentWidth}>
        <Text color={theme.kode} bold wrap="wrap">
          {text}
        </Text>
      </Box>
    </Box>
  )
}
