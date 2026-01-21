import { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import { Box, Text } from 'ink'
import * as React from 'react'
import { Tool } from '#core/tooling/Tool'
import { Message, UserMessage } from '#core/query'
import { useGetToolFromMessages } from './utils'
import { renderInkToolResultMessage } from '#ui-ink/toolPresenters/registry'

type Props = {
  param: ToolResultBlockParam
  message: UserMessage
  messages: Message[]
  verbose: boolean
  tools: Tool[]
  width: number | string
}

export function UserToolSuccessMessage({
  param,
  message,
  messages,
  tools,
  verbose,
  width,
}: Props): React.ReactNode {
  const { tool } = useGetToolFromMessages(param.tool_use_id, tools, messages)

  if (!message.toolUseResult) {
    const contentText = typeof param.content === 'string' ? param.content : null
    return (
      <Box flexDirection="column" width={width}>
        <Text dimColor wrap="truncate-end">
          Tool output unavailable (missing persisted tool result data).
        </Text>
        {contentText ? <Text>{contentText}</Text> : null}
      </Box>
    )
  }

  return (
    // NOTE: tool_result is rendered under the user message container for parity with the legacy transcript shape.
    <Box flexDirection="column" width={width}>
      {renderInkToolResultMessage(tool, message.toolUseResult.data as never, {
        verbose,
      })}
    </Box>
  )
}
