import { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import { Box } from 'ink'
import * as React from 'react'
import { Tool } from '@tool'
import { Message, UserMessage } from '@query'
import { useGetToolFromMessages } from './utils'
import { FallbackToolResultMessage } from './FallbackToolResultMessage'

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
  const lookup = useGetToolFromMessages(param.tool_use_id, tools, messages)

  if (
    !lookup ||
    !lookup.tool.renderToolResultMessage ||
    !message.toolUseResult
  ) {
    return (
      <Box flexDirection="column" width={width}>
        <FallbackToolResultMessage content={param.content} verbose={verbose} />
      </Box>
    )
  }

  return (
    <Box flexDirection="column" width={width}>
      {lookup.tool.renderToolResultMessage(
        message.toolUseResult.data as never,
        {
          verbose,
        },
      )}
    </Box>
  )
}
