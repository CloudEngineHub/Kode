import { Box } from 'ink'
import * as React from 'react'
import type { AssistantMessage, Message, UserMessage } from '#core/query'
import type {
  ContentBlock,
  DocumentBlockParam,
  ImageBlockParam,
  TextBlockParam,
  ThinkingBlockParam,
  ToolResultBlockParam,
  ToolUseBlockParam,
} from '@anthropic-ai/sdk/resources/index.mjs'
import { Tool } from '#core/tooling/Tool'
import { logError } from '#core/utils/log'
import { UserToolResultMessage } from './messages/UserToolResultMessage/UserToolResultMessage'
import { AssistantToolUseMessage } from './messages/AssistantToolUseMessage'
import { AssistantTextMessage } from './messages/AssistantTextMessage'
import { UserTextMessage } from './messages/UserTextMessage'
import { UserImageMessage } from './messages/UserImageMessage'
import { NormalizedMessage } from '#core/utils/messages'
import { AssistantThinkingMessage } from './messages/AssistantThinkingMessage'
import { AssistantRedactedThinkingMessage } from './messages/AssistantRedactedThinkingMessage'
import { useTerminalSize } from '#ui-ink/hooks/useTerminalSize'

type Props = {
  message: UserMessage | AssistantMessage
  messages: NormalizedMessage[]
  // NOTE: addMargin is handled at this layer to keep message spacing consistent in the TUI.
  addMargin: boolean
  tools: Tool[]
  verbose: boolean
  debug: boolean
  erroredToolUseIDs: Set<string>
  inProgressToolUseIDs: Set<string>
  unresolvedToolUseIDs: Set<string>
  shouldAnimate: boolean
  shouldShowDot: boolean
  width?: number | string
  isTransient?: boolean
}

export function Message({
  message,
  messages,
  addMargin,
  tools,
  verbose,
  debug,
  erroredToolUseIDs,
  inProgressToolUseIDs,
  unresolvedToolUseIDs,
  shouldAnimate,
  shouldShowDot,
  width,
  isTransient,
}: Props): React.ReactNode {
  // Assistant message
  if (message.type === 'assistant') {
    return (
      <Box flexDirection="column" width="100%">
        {message.message.content.map((_, index) => (
          <AssistantMessage
            key={index}
            param={_}
            costUSD={message.costUSD}
            durationMs={message.durationMs}
            addMargin={addMargin}
            tools={tools}
            debug={debug}
            options={{ verbose }}
            erroredToolUseIDs={erroredToolUseIDs}
            inProgressToolUseIDs={inProgressToolUseIDs}
            unresolvedToolUseIDs={unresolvedToolUseIDs}
            shouldAnimate={shouldAnimate}
            shouldShowDot={shouldShowDot}
            width={width}
            isTransient={isTransient}
          />
        ))}
      </Box>
    )
  }

  // User message
  // NOTE: legacy user messages may store content as a string; normalize to blocks here.
  const content =
    typeof message.message.content === 'string'
      ? [{ type: 'text', text: message.message.content } as TextBlockParam]
      : message.message.content
  return (
    <Box flexDirection="column" width="100%">
      {content.map((_, index) => (
        <UserMessage
          key={index}
          message={message}
          messages={messages}
          addMargin={addMargin}
          tools={tools}
          param={_ as TextBlockParam}
          options={{ verbose }}
        />
      ))}
    </Box>
  )
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

function getBlockType(value: unknown): string {
  const record = asRecord(value)
  return record && typeof record.type === 'string' ? record.type : ''
}

function UserMessage({
  message,
  messages,
  addMargin,
  tools,
  param,
  options: { verbose },
}: {
  message: UserMessage
  messages: Message[]
  addMargin: boolean
  tools: Tool[]
  param:
    | TextBlockParam
    | DocumentBlockParam
    | ImageBlockParam
    | ToolUseBlockParam
    | ToolResultBlockParam
  options: {
    verbose: boolean
  }
  key?: React.Key
}): React.ReactNode {
  const { columns } = useTerminalSize()
  switch (param.type) {
    case 'text':
      return <UserTextMessage addMargin={addMargin} param={param} />
    case 'image':
      return <UserImageMessage addMargin={addMargin} param={param} />
    case 'tool_result':
      return (
        <UserToolResultMessage
          param={param}
          message={message}
          messages={messages}
          tools={tools}
          verbose={verbose}
          width={columns - 5}
        />
      )
  }
}

function AssistantMessage({
  param,
  costUSD,
  durationMs,
  addMargin,
  tools,
  debug,
  options: { verbose },
  erroredToolUseIDs,
  inProgressToolUseIDs,
  unresolvedToolUseIDs,
  shouldAnimate,
  shouldShowDot,
  width,
  isTransient,
}: {
  param:
    | ContentBlock
    | TextBlockParam
    | ImageBlockParam
    | ThinkingBlockParam
    | ToolUseBlockParam
    | ToolResultBlockParam
  costUSD: number
  durationMs: number
  addMargin: boolean
  tools: Tool[]
  debug: boolean
  options: {
    verbose: boolean
  }
  erroredToolUseIDs: Set<string>
  inProgressToolUseIDs: Set<string>
  unresolvedToolUseIDs: Set<string>
  shouldAnimate: boolean
  shouldShowDot: boolean
  width?: number | string
  isTransient?: boolean
  key?: React.Key
}): React.ReactNode {
  const type = getBlockType(param)
  switch (type) {
    case 'tool_use':
    case 'server_tool_use':
    case 'mcp_tool_use': {
      const normalizedParam: ToolUseBlockParam =
        type === 'tool_use'
          ? (param as ToolUseBlockParam)
          : { ...(param as ToolUseBlockParam), type: 'tool_use' }
      return (
        <AssistantToolUseMessage
          param={normalizedParam}
          costUSD={costUSD}
          durationMs={durationMs}
          addMargin={addMargin}
          tools={tools}
          debug={debug}
          verbose={verbose}
          erroredToolUseIDs={erroredToolUseIDs}
          inProgressToolUseIDs={inProgressToolUseIDs}
          unresolvedToolUseIDs={unresolvedToolUseIDs}
          shouldAnimate={shouldAnimate}
          shouldShowDot={shouldShowDot}
        />
      )
    }
    case 'text':
      return (
        <AssistantTextMessage
          param={param as TextBlockParam}
          costUSD={costUSD}
          durationMs={durationMs}
          debug={debug}
          addMargin={addMargin}
          shouldShowDot={shouldShowDot}
          verbose={verbose}
          width={width}
          isTransient={isTransient}
        />
      )
    case 'redacted_thinking':
      return <AssistantRedactedThinkingMessage addMargin={addMargin} />
    case 'thinking':
      return (
        <AssistantThinkingMessage
          addMargin={addMargin}
          param={param as ThinkingBlockParam}
        />
      )
    default:
      logError(`Unable to render message type: ${type || '(unknown)'}`)
      return null
  }
}
