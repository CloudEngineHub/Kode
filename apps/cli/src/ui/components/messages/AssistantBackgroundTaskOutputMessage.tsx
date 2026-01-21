import { Box, Text } from 'ink'
import * as React from 'react'
import { extractTag } from '#core/utils/messages'
import { getTheme } from '#core/utils/theme'

export function AssistantBackgroundTaskOutputMessage({
  content,
}: {
  content: string
}): React.ReactNode {
  const message = extractTag(content, 'background-task-output')
  if (!message) {
    return null
  }

  const lines = message.split(/\r?\n/)

  return (
    <Box flexDirection="column">
      {lines.map((line, index) => (
        <Box key={index} flexDirection="row">
          <Text>
            &nbsp;&nbsp;⎿ &nbsp;
            <Text color={getTheme().secondaryText}>{line}</Text>
          </Text>
        </Box>
      ))}
    </Box>
  )
}
