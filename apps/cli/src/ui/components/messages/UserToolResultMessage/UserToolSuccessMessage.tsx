import { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import { Box } from 'ink'
import * as React from 'react'
import { Tool } from '#core/tooling/Tool'
import { Message, UserMessage } from '#core/query'
import { useGetToolFromMessages } from './utils'
import { renderInkToolResultMessage } from '#ui-ink/toolPresenters/registry'
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

  if (!lookup || !message.toolUseResult) {
    return (
      <Box flexDirection="column" width={width}>
        <FallbackToolResultMessage content={param.content} verbose={verbose} />
      </Box>
    )
  }

  return (
    // NOTE: tool_result is rendered under the user message container for parity with the legacy transcript shape.
    <Box flexDirection="column" width={width}>
      {renderInkToolResultMessage(
        lookup.tool,
        message.toolUseResult.data as never,
        {
          verbose,
        },
      )}
    </Box>
  )
}
