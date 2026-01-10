import * as React from 'react'
import { extractTag } from '#core/utils/messages'
import { getTheme } from '#core/utils/theme'
import { Box, Text } from 'ink'
import { MaxSizedText } from '#ui-ink/components/MaxSizedText'

export function AssistantLocalCommandOutputMessage({
  content,
  maxHeight,
  maxWidth,
}: {
  content: string
  maxHeight?: number
  maxWidth?: number
}): React.ReactNode[] {
  const stdout = extractTag(content, 'local-command-stdout')
  const stderr = extractTag(content, 'local-command-stderr')
  if (!stdout && !stderr) {
    return []
  }
  const theme = getTheme()
  let insides = [
    format(stdout?.trim(), theme.text, maxHeight, maxWidth),
    format(stderr?.trim(), theme.error, maxHeight, maxWidth),
  ].filter(Boolean)

  if (insides.length === 0) {
    insides = [
      <React.Fragment key="0">
        <Text>(No output)</Text>
      </React.Fragment>,
    ]
  }

  return [
    <Box key="0" gap={1}>
      <Box>
        <Text color={theme.secondaryText}>{'  '}⎿ </Text>
      </Box>
      {insides.map((_, index) => (
        <Box key={index} flexDirection="column">
          {_}
        </Box>
      ))}
    </Box>,
  ]
}

function format(
  content: string | undefined,
  color: string,
  maxHeight?: number,
  maxWidth?: number,
): React.ReactNode {
  if (!content) {
    return null
  }
  if (maxHeight && maxWidth) {
    return (
      <MaxSizedText
        text={content}
        maxHeight={maxHeight}
        maxWidth={maxWidth}
        overflowDirection="bottom"
      />
    )
  }
  return <Text color={color}>{content}</Text>
}
