import { memoize } from 'lodash-es'

import type {
  ToolResultBlockParam,
  ToolUseBlockParam,
} from '@anthropic-ai/sdk/resources/index.mjs'

import type { AssistantMessage, Message, ProgressMessage } from '#core/query'

import type { NormalizedMessage } from './normalize'
import { extractTag } from './tags'

type ToolUseRequestMessage = AssistantMessage & {
  message: { content: any[] }
}

type ToolUseLikeBlockParam = ToolUseBlockParam & {
  type: 'tool_use' | 'server_tool_use' | 'mcp_tool_use'
}

function isToolUseLikeBlockParam(block: any): block is ToolUseLikeBlockParam {
  return (
    block &&
    typeof block === 'object' &&
    (block.type === 'tool_use' ||
      block.type === 'server_tool_use' ||
      block.type === 'mcp_tool_use') &&
    typeof block.id === 'string'
  )
}

function isToolUseRequestMessage(
  message: Message,
): message is ToolUseRequestMessage {
  return (
    message.type === 'assistant' &&
    'costUSD' in message &&
    message.message.content.some(isToolUseLikeBlockParam)
  )
}

export function reorderMessages(
  messages: NormalizedMessage[],
): NormalizedMessage[] {
  const ms: NormalizedMessage[] = []
  const toolUseMessages: ToolUseRequestMessage[] = []

  for (const message of messages) {
    if (isToolUseRequestMessage(message)) {
      toolUseMessages.push(message)
    }

    if (message.type === 'progress') {
      const existingProgressMessage = ms.find(
        _ => _.type === 'progress' && _.toolUseID === message.toolUseID,
      )
      if (existingProgressMessage) {
        ms[ms.indexOf(existingProgressMessage)] = message
        continue
      }
      const toolUseMessage = toolUseMessages.find(
        _ => _.message.content[0]?.id === message.toolUseID,
      )
      if (toolUseMessage) {
        ms.splice(ms.indexOf(toolUseMessage) + 1, 0, message)
        continue
      }
    }

    if (
      message.type === 'user' &&
      Array.isArray(message.message.content) &&
      message.message.content[0]?.type === 'tool_result'
    ) {
      const toolUseID = (message.message.content[0] as ToolResultBlockParam)
        ?.tool_use_id

      const lastProgressMessage = ms.find(
        _ => _.type === 'progress' && _.toolUseID === toolUseID,
      )
      if (lastProgressMessage) {
        ms.splice(ms.indexOf(lastProgressMessage) + 1, 0, message)
        continue
      }

      const toolUseMessage = toolUseMessages.find(
        _ => _.message.content[0]?.id === toolUseID,
      )
      if (toolUseMessage) {
        ms.splice(ms.indexOf(toolUseMessage) + 1, 0, message)
        continue
      }
    } else {
      ms.push(message)
    }
  }

  return ms
}

const getToolResultIDs = memoize(
  (normalizedMessages: NormalizedMessage[]): { [toolUseID: string]: boolean } =>
    Object.fromEntries(
      normalizedMessages.flatMap(_ =>
        _.type === 'user' && _.message.content[0]?.type === 'tool_result'
          ? [
              [
                _.message.content[0]!.tool_use_id,
                _.message.content[0]!.is_error ?? false,
              ],
            ]
          : ([] as [string, boolean][]),
      ),
    ),
)

export function getUnresolvedToolUseIDs(
  normalizedMessages: NormalizedMessage[],
): Set<string> {
  const toolResults = getToolResultIDs(normalizedMessages)
  return new Set(
    normalizedMessages
      .filter(
        (
          _,
        ): _ is AssistantMessage & {
          message: { content: [ToolUseLikeBlockParam] }
        } =>
          _.type === 'assistant' &&
          Array.isArray(_.message.content) &&
          isToolUseLikeBlockParam(_.message.content[0]) &&
          !(_.message.content[0].id in toolResults),
      )
      .map(_ => _.message.content[0].id),
  )
}

export function getInProgressToolUseIDs(
  normalizedMessages: NormalizedMessage[],
): Set<string> {
  const unresolvedToolUseIDs = getUnresolvedToolUseIDs(normalizedMessages)

  function isQueuedWaitingProgressMessage(message: NormalizedMessage): boolean {
    if (message.type !== 'progress') return false
    const firstBlock = message.content.message.content[0]
    if (!firstBlock || firstBlock.type !== 'text') return false
    const rawText = String(firstBlock.text ?? '')
    const text = rawText.startsWith('<tool-progress>')
      ? (extractTag(rawText, 'tool-progress') ?? rawText)
      : rawText
    return text.trim() === 'Waiting…'
  }

  const toolUseIDsThatHaveProgressMessages = new Set(
    normalizedMessages
      .filter(
        (_): _ is ProgressMessage =>
          _.type === 'progress' && !isQueuedWaitingProgressMessage(_),
      )
      .map(_ => _.toolUseID),
  )
  return new Set(
    (
      normalizedMessages.filter(_ => {
        if (_.type !== 'assistant') {
          return false
        }
        const firstBlock = _.message.content[0]
        if (!isToolUseLikeBlockParam(firstBlock)) return false
        const toolUseID = firstBlock.id
        if (toolUseID === unresolvedToolUseIDs.values().next().value) {
          return true
        }

        if (
          toolUseIDsThatHaveProgressMessages.has(toolUseID) &&
          unresolvedToolUseIDs.has(toolUseID)
        ) {
          return true
        }

        return false
      }) as AssistantMessage[]
    ).map(_ => (_.message.content[0]! as ToolUseBlockParam).id),
  )
}

export function getErroredToolUseMessages(
  normalizedMessages: NormalizedMessage[],
): AssistantMessage[] {
  const toolResults = getToolResultIDs(normalizedMessages)
  return normalizedMessages.filter(
    _ =>
      _.type === 'assistant' &&
      Array.isArray(_.message.content) &&
      isToolUseLikeBlockParam(_.message.content[0]) &&
      _.message.content[0].id in toolResults &&
      toolResults[_.message.content[0].id],
  ) as AssistantMessage[]
}

export function getToolUseID(message: NormalizedMessage): string | null {
  switch (message.type) {
    case 'assistant':
      return isToolUseLikeBlockParam(message.message.content[0])
        ? message.message.content[0].id
        : null
    case 'user':
      if (message.message.content[0]?.type !== 'tool_result') {
        return null
      }
      return message.message.content[0].tool_use_id
    case 'progress':
      return message.toolUseID
  }
}
