import { Box, Text } from 'ink'
import * as React from 'react'
import { extractTag } from '#core/utils/messages'
import { getTheme } from '#core/utils/theme'
import { TextBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'

type Props = {
  addMargin: boolean
  param: TextBlockParam
}

export function UserBackgroundTaskInputMessage({
  param: { text },
  addMargin,
}: Props): React.ReactNode {
  const input = extractTag(text, 'background-task-input')
  if (!input) {
    return null
  }
  return (
    <Box flexDirection="column" marginTop={addMargin ? 1 : 0} width="100%">
      <Box>
        <Text color={getTheme().bashBorder}>&amp;</Text>
        <Text color={getTheme().secondaryText}> {input}</Text>
      </Box>
    </Box>
  )
}
