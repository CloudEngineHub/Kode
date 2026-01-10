import type {
  ToolResultBlockParam,
  ToolUseBlock,
} from '@anthropic-ai/sdk/resources/index.mjs'
import { randomUUID } from 'crypto'
import { existsSync, readFileSync } from 'fs'

import type {
  Message as ConversationMessage,
  AssistantMessage,
} from '#core/query'
import { getMessagesPath } from '#core/utils/log'
import { createUserMessage, type FullToolUseResult } from '#core/utils/messages'

const FORK_CONTEXT_TOOL_RESULT_TEXT = `### FORKING CONVERSATION CONTEXT ###
### ENTERING SUB-AGENT ROUTINE ###
Entered sub-agent context

PLEASE NOTE: 
- The messages above this point are from the main thread prior to sub-agent execution. They are provided as context only.
- Context messages may include tool_use blocks for tools that are not available in the sub-agent context. You should only use the tools specifically provided to you in the system prompt.
- Only complete the specific sub-agent task you have been assigned below.`

type ToolUseLikeBlock = ToolUseBlock & {
  type: 'tool_use' | 'server_tool_use' | 'mcp_tool_use'
}

function isToolUseLikeBlock(block: unknown): block is ToolUseLikeBlock {
  if (!block || typeof block !== 'object') return false
  const type = (block as { type?: unknown }).type
  if (
    type !== 'tool_use' &&
    type !== 'server_tool_use' &&
    type !== 'mcp_tool_use'
  ) {
    return false
  }
  const id = (block as { id?: unknown }).id
  return typeof id === 'string' && id.length > 0
}

function isConversationMessage(value: unknown): value is ConversationMessage {
  if (!value || typeof value !== 'object') return false
  const type = (value as { type?: unknown }).type
  return type === 'assistant' || type === 'user' || type === 'progress'
}

function readJsonArrayFile(path: string): unknown[] | null {
  if (!existsSync(path)) return null
  try {
    const raw = readFileSync(path, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function createForkContextToolResult(options: {
  toolUseId: string
}): ConversationMessage {
  const toolResultBlock: ToolResultBlockParam = {
    type: 'tool_result',
    tool_use_id: options.toolUseId,
    content: FORK_CONTEXT_TOOL_RESULT_TEXT,
  }

  const toolUseResult: FullToolUseResult = {
    data: {
      status: 'sub_agent_entered',
      description: 'Entered sub-agent context',
      message: FORK_CONTEXT_TOOL_RESULT_TEXT,
    },
    resultForAssistant: FORK_CONTEXT_TOOL_RESULT_TEXT,
  }

  return createUserMessage([toolResultBlock], toolUseResult)
}

function createToolUseOnlyAssistantMessage(options: {
  message: AssistantMessage
  toolUseBlock: ToolUseLikeBlock
}): AssistantMessage {
  return {
    ...options.message,
    uuid: randomUUID(),
    message: {
      ...options.message.message,
      content: [options.toolUseBlock],
    },
  }
}

export function buildForkContextForAgent(options: {
  enabled: boolean
  prompt: string
  toolUseId: string | undefined
  messageLogName: string
  forkNumber: number
}): {
  forkContextMessages: ConversationMessage[]
  promptMessages: ConversationMessage[]
} {
  const userPromptMessage = createUserMessage(options.prompt)

  if (!options.enabled || !options.toolUseId) {
    return {
      forkContextMessages: [],
      promptMessages: [userPromptMessage],
    }
  }

  const mainPath = getMessagesPath(
    options.messageLogName,
    options.forkNumber,
    0,
  )
  const raw = readJsonArrayFile(mainPath)
  const mainMessages = (raw ?? []).filter(isConversationMessage)
  if (mainMessages.length === 0) {
    return {
      forkContextMessages: [],
      promptMessages: [userPromptMessage],
    }
  }

  let toolUseMessageIndex = -1
  let toolUseMessage: AssistantMessage | null = null
  let taskToolUseBlock: ToolUseLikeBlock | null = null

  for (let i = 0; i < mainMessages.length; i++) {
    const msg = mainMessages[i]
    if (msg.type !== 'assistant') continue
    const blocks: unknown[] = Array.isArray(msg.message?.content)
      ? (msg.message.content as unknown[])
      : []
    const match = blocks.find(
      (b): b is ToolUseLikeBlock =>
        isToolUseLikeBlock(b) && b.id === options.toolUseId,
    )
    if (!match) continue
    toolUseMessageIndex = i
    toolUseMessage = msg
    taskToolUseBlock = match
    break
  }

  if (toolUseMessageIndex === -1 || !toolUseMessage || !taskToolUseBlock) {
    return {
      forkContextMessages: [],
      promptMessages: [userPromptMessage],
    }
  }

  const forkContextMessages = mainMessages.slice(0, toolUseMessageIndex) ?? []

  const toolUseOnlyAssistant = createToolUseOnlyAssistantMessage({
    message: toolUseMessage,
    toolUseBlock: taskToolUseBlock,
  })
  const forkContextToolResult = createForkContextToolResult({
    toolUseId: taskToolUseBlock.id,
  })

  return {
    forkContextMessages,
    promptMessages: [
      toolUseOnlyAssistant,
      forkContextToolResult,
      userPromptMessage,
    ],
  }
}
