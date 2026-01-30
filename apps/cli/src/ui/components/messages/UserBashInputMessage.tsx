import { Box, Text } from 'ink'
import * as React from 'react'
import { extractTag } from '#core/utils/messages'
import { getTheme } from '#core/utils/theme'
import { TextBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'

type Props = {
  addMargin: boolean
  param: TextBlockParam
}

export function UserBashInputMessage({
  param: { text },
  addMargin,
}: Props): React.ReactNode {
  const input = extractTag(text, 'bash-input')
  if (!input) {
    return null
  }
  const theme = getTheme()
  return (
    <Box flexDirection="column" marginTop={addMargin ? 1 : 0} width="100%">
      <Box>
        <Text color={theme.bashBorder} bold>
          $
        </Text>
        <Text bold> {input}</Text>
      </Box>
    </Box>
  )
}
