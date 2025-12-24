import { createHash, randomUUID, UUID } from 'crypto'
import { Box } from 'ink'
import { AssistantMessage, Message, ProgressMessage, UserMessage } from '@query'
import { getCommand, hasCommand } from '@commands'
import { MalformedCommandError } from './errors'
import { logError } from './log'
import { resolve } from 'path'
import { last, memoize } from 'lodash-es'
import type { SetToolJSXFn, Tool, ToolUseContext } from '@tool'
import { lastX } from '@utils/generators'
import { NO_CONTENT_MESSAGE } from '@services/llmConstants'
import {
  ImageBlockParam,
  TextBlockParam,
  ToolResultBlockParam,
  ToolUseBlockParam,
  Message as APIMessage,
  ContentBlockParam,
  ContentBlock,
} from '@anthropic-ai/sdk/resources/index.mjs'
import { setCwd } from './state'
import { getCwd } from './state'
import chalk from 'chalk'
import * as React from 'react'
import { UserBashInputMessage } from '@components/messages/UserBashInputMessage'
import { Spinner } from '@components/Spinner'
import { BashTool } from '@tools/BashTool/BashTool'
import { ToolUseBlock } from '@anthropic-ai/sdk/resources/index.mjs'

// NOTE: Dynamic content processing for custom commands has been moved to
// src/services/customCommands.ts for better organization and reusability.
// The functions executeBashCommands and resolveFileReferences are no longer
// duplicated here but are imported when needed for custom command processing.

export const INTERRUPT_MESSAGE = '[Request interrupted by user]'
export const INTERRUPT_MESSAGE_FOR_TOOL_USE =
  '[Request interrupted by user for tool use]'
export const CANCEL_MESSAGE =
  "The user doesn't want to take this action right now. STOP what you are doing and wait for the user to tell you how to proceed."
export const REJECT_MESSAGE =
  "The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). STOP what you are doing and wait for the user to tell you how to proceed."
export const REJECT_MESSAGE_WITH_FEEDBACK_PREFIX = `The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). To tell you how to proceed, the user said:\n`
export const REJECTED_PLAN_PREFIX = `The agent proposed a plan that was rejected by the user. The user chose to stay in plan mode rather than proceed with implementation.\n\nRejected plan:\n`
export const NO_RESPONSE_REQUESTED = 'No response requested.'

export const SYNTHETIC_ASSISTANT_MESSAGES = new Set([
  INTERRUPT_MESSAGE,
  INTERRUPT_MESSAGE_FOR_TOOL_USE,
  CANCEL_MESSAGE,
  REJECT_MESSAGE,
  NO_RESPONSE_REQUESTED,
])

function stableUuidFromSeed(seed: string): UUID {
  const hex = createHash('sha256').update(seed).digest('hex').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}` as UUID
}

function baseCreateAssistantMessage(
  content: ContentBlock[],
  extra?: Partial<AssistantMessage>,
): AssistantMessage {
  return {
    type: 'assistant',
    costUSD: 0,
    durationMs: 0,
    uuid: randomUUID(),
    message: {
      id: randomUUID(),
      model: '<synthetic>',
      role: 'assistant',
      stop_reason: 'stop_sequence',
      stop_sequence: '',
      type: 'message',
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
      content,
    },
    ...extra,
  }
}

export function createAssistantMessage(content: string): AssistantMessage {
  return baseCreateAssistantMessage([
    {
      type: 'text' as const,
      text: content === '' ? NO_CONTENT_MESSAGE : content,
      citations: [],
    },
  ])
}

export function createAssistantAPIErrorMessage(
  content: string,
): AssistantMessage {
  return baseCreateAssistantMessage(
    [
      {
        type: 'text' as const,
        text: content === '' ? NO_CONTENT_MESSAGE : content,
        citations: [],
      },
    ],
    { isApiErrorMessage: true },
  )
}

export type FullToolUseResult = {
  data: unknown // Matches tool's `Output` type
  resultForAssistant: ToolResultBlockParam['content']
  // Compatibility: tool extensions (used by SlashCommand/Skill)
  newMessages?: Message[]
  contextModifier?: { modifyContext: (ctx: any) => any }
}

export function createUserMessage(
  content: string | ContentBlockParam[],
  toolUseResult?: FullToolUseResult,
): UserMessage {
  const m: UserMessage = {
    type: 'user',
    message: {
      role: 'user',
      content,
    },
    uuid: randomUUID(),
    toolUseResult,
  }
  return m
}

export function createProgressMessage(
  toolUseID: string,
  siblingToolUseIDs: Set<string>,
  content: AssistantMessage,
  normalizedMessages: NormalizedMessage[],
  tools: Tool[],
): ProgressMessage {
  return {
    type: 'progress',
    content,
    normalizedMessages,
    siblingToolUseIDs,
    tools,
    toolUseID,
    uuid: randomUUID(),
  }
}

export function createToolResultStopMessage(
  toolUseID: string,
): ToolResultBlockParam {
  return {
    type: 'tool_result',
    content: CANCEL_MESSAGE,
    is_error: true,
    tool_use_id: toolUseID,
  }
}

export async function processUserInput(
  input: string,
  mode: 'bash' | 'prompt' | 'koding',
  setToolJSX: SetToolJSXFn,
  context: ToolUseContext & {
    setForkConvoWithMessagesOnTheNextRender: (
      forkConvoWithMessages: Message[],
    ) => void
    options?: {
      isKodingRequest?: boolean
      kodingContext?: string
    }
  },
  pastedImages: Array<{
    placeholder: string
    data: string
    mediaType: string
  }> | null,
): Promise<Message[]> {
  // Bash commands
  if (mode === 'bash') {
    const userMessage = createUserMessage(`<bash-input>${input}</bash-input>`)

    // Special case: cd
    if (input.startsWith('cd ')) {
      const oldCwd = getCwd()
      const newCwd = resolve(getCwd(), input.slice(3).trim())
      try {
        await setCwd(newCwd)
        return [
          userMessage,
          createAssistantMessage(
            `<bash-stdout>Changed directory to ${chalk.bold(`${newCwd}/`)}</bash-stdout>`,
          ),
        ]
      } catch (e) {
        logError(e)
        return [
          userMessage,
          createAssistantMessage(
            `<bash-stderr>cwd error: ${e instanceof Error ? e.message : String(e)}</bash-stderr>`,
          ),
        ]
      }
    }

    // All other bash commands
    setToolJSX({
      jsx: (
        <Box flexDirection="column" marginTop={1}>
          <UserBashInputMessage
            addMargin={false}
            param={{ text: `<bash-input>${input}</bash-input>`, type: 'text' }}
          />
          <Spinner />
        </Box>
      ),
      shouldHidePromptInput: false,
    })
    try {
      const validationResult = await BashTool.validateInput(
        { command: input },
        { commandSource: 'user_bash_mode' } as any,
      )
      if (!validationResult.result) {
        return [userMessage, createAssistantMessage(validationResult.message)]
      }
      const { data } = await lastX(
        BashTool.call({ command: input }, {
          ...(context as any),
          commandSource: 'user_bash_mode',
        } as any),
      )
      return [
        userMessage,
        createAssistantMessage(
          `<bash-stdout>${data.stdout}</bash-stdout><bash-stderr>${data.stderr}</bash-stderr>`,
        ),
      ]
    } catch (e) {
      return [
        userMessage,
        createAssistantMessage(
          `<bash-stderr>Command failed: ${e instanceof Error ? e.message : String(e)}</bash-stderr>`,
        ),
      ]
    } finally {
      setToolJSX(null)
    }
  }
  // Koding mode - special wrapper for display
  else if (mode === 'koding') {
    const userMessage = createUserMessage(
      `<koding-input>${input}</koding-input>`,
    )
    // Add the Koding flag to the message
    userMessage.options = {
      ...userMessage.options,
      isKodingRequest: true,
    }

    // Rest of koding processing is handled separately to capture assistant response
    return [userMessage]
  }

  // Slash commands
  if (context.options?.disableSlashCommands !== true && input.startsWith('/')) {
    const words = input.slice(1).split(' ')
    let commandName = words[0]
    if (words.length > 1 && words[1] === '(MCP)') {
      commandName = commandName + ' (MCP)'
    }
    if (!commandName) {
      return [
        createAssistantMessage('Commands are in the form `/command [args]`'),
      ]
    }

    // Check if it's a real command before processing
    if (!hasCommand(commandName, context.options.commands)) {
      // If not a real command, treat it as a regular user input

      return [createUserMessage(input)]
    }

    const args = input.slice(commandName.length + 2)
    const newMessages = await getMessagesForSlashCommand(
      commandName,
      args,
      setToolJSX,
      context,
    )

    // Local JSX commands
    if (newMessages.length === 0) {
      return []
    }

    // For invalid commands, preserve both the user message and error
    if (
      newMessages.length === 2 &&
      newMessages[0]!.type === 'user' &&
      newMessages[1]!.type === 'assistant' &&
      typeof newMessages[1]!.message.content === 'string' &&
      newMessages[1]!.message.content.startsWith('Unknown command:')
    ) {
      return newMessages
    }

    // User-Assistant pair (eg. local commands)
    if (newMessages.length === 2) {
      return newMessages
    }

    // A valid command

    return newMessages
  }

  // Regular user prompt

  // Check if this is a Koding request that needs special handling
  const isKodingRequest = context.options?.isKodingRequest === true
  const kodingContextInfo = context.options?.kodingContext

  // Create base message
  let userMessage: UserMessage

  let processedInput =
    isKodingRequest && kodingContextInfo
      ? `${kodingContextInfo}\n\n${input}`
      : input

  // Process dynamic content for custom commands with ! and @ prefixes
  // This uses the same processing functions as custom commands to maintain consistency
  if (processedInput.includes('!`') || processedInput.includes('@')) {
    try {
      // Import functions from customCommands service to avoid code duplication
      const { executeBashCommands } = await import('@services/customCommands')

      // Execute bash commands if present
      if (processedInput.includes('!`')) {
        processedInput = await executeBashCommands(processedInput)
      }

      // Process mentions for system reminder integration
      // Note: We don't call resolveFileReferences here anymore -
      // @file mentions should trigger Read tool usage via reminders, not embed content
      if (processedInput.includes('@')) {
        const { processMentions } = await import('@services/mentionProcessor')
        await processMentions(processedInput)
      }
    } catch (error) {
      console.warn('Dynamic content processing failed:', error)
      // Continue with original input if processing fails
    }
  }

  if (pastedImages && pastedImages.length > 0) {
    const occurrences = pastedImages
      .map(img => ({ img, index: processedInput.indexOf(img.placeholder) }))
      .filter(o => o.index >= 0)
      .sort((a, b) => a.index - b.index)

    const blocks: ContentBlockParam[] = []
    let cursor = 0

    for (const { img, index } of occurrences) {
      const before = processedInput.slice(cursor, index)
      if (before) {
        blocks.push({ type: 'text', text: before })
      }
      blocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: img.mediaType,
          data: img.data,
        },
      } as any)
      cursor = index + img.placeholder.length
    }

    const after = processedInput.slice(cursor)
    if (after) {
      blocks.push({ type: 'text', text: after })
    }

    if (!blocks.some(b => b.type === 'text')) {
      blocks.push({ type: 'text', text: '' })
    }

    userMessage = createUserMessage(blocks)
  } else {
    userMessage = createUserMessage(processedInput)
  }

  // Add the Koding flag to the message if needed
  if (isKodingRequest) {
    userMessage.options = {
      ...userMessage.options,
      isKodingRequest: true,
    }
  }

  return [userMessage]
}

async function getMessagesForSlashCommand(
  commandName: string,
  args: string,
  setToolJSX: SetToolJSXFn,
  context: ToolUseContext & {
    setForkConvoWithMessagesOnTheNextRender: (
      forkConvoWithMessages: Message[],
    ) => void
  },
): Promise<Message[]> {
  try {
    const command = getCommand(commandName, context.options.commands)
    switch (command.type) {
      case 'local-jsx': {
        return new Promise(resolve => {
          command
            .call(
              r => {
                setToolJSX(null)
                resolve([
                  createUserMessage(`<command-name>${command.userFacingName()}</command-name>
          <command-message>${command.userFacingName()}</command-message>
          <command-args>${args}</command-args>`),
                  r
                    ? createAssistantMessage(r)
                    : createAssistantMessage(NO_RESPONSE_REQUESTED),
                ])
              },
              context,
              args,
            )
            .then(jsx => {
              if (!jsx) return
              setToolJSX({ jsx, shouldHidePromptInput: true })
            })
        })
      }
      case 'local': {
        const userMessage =
          createUserMessage(`<command-name>${command.userFacingName()}</command-name>
        <command-message>${command.userFacingName()}</command-message>
        <command-args>${args}</command-args>`)

        try {
          // Use the context's abortController for local commands
          const result = await command.call(args, {
            ...context,
            options: {
              commands: context.options.commands || [],
              tools: context.options.tools || [],
              slowAndCapableModel:
                context.options.slowAndCapableModel || 'main',
            },
          })

          return [
            userMessage,
            createAssistantMessage(
              `<local-command-stdout>${result}</local-command-stdout>`,
            ),
          ]
        } catch (e) {
          logError(e)
          return [
            userMessage,
            createAssistantMessage(
              `<local-command-stderr>${String(e)}</local-command-stderr>`,
            ),
          ]
        }
      }
      case 'prompt': {
        // Compatibility: emit a metadata message, then the expanded prompt.
        const commandName = command.userFacingName()
        const progressMessage = (command as any).progressMessage || 'running'
        const metaMessage =
          createUserMessage(`<command-name>${commandName}</command-name>
        <command-message>${commandName} is ${progressMessage}…</command-message>
        <command-args>${args}</command-args>`)

        const prompt = await command.getPromptForCommand(args)
        const expandedMessages = prompt.map(msg => {
          // Create a normal user message from the custom command content
          const userMessage = createUserMessage(
            typeof msg.content === 'string'
              ? msg.content
              : msg.content
                  .map(block => (block.type === 'text' ? block.text : ''))
                  .join('\n'),
          )

          // Add metadata for tracking but don't wrap in special tags
          userMessage.options = {
            ...userMessage.options,
            isCustomCommand: true,
            commandName: command.userFacingName(),
            commandArgs: args,
          }

          return userMessage
        })

        return [metaMessage, ...expandedMessages]
      }
    }
  } catch (e) {
    if (e instanceof MalformedCommandError) {
      return [createAssistantMessage(e.message)]
    }
    throw e
  }
}

export function extractTagFromMessage(
  message: Message,
  tagName: string,
): string | null {
  if (message.type === 'progress') {
    return null
  }
  if (typeof message.message.content !== 'string') {
    return null
  }
  return extractTag(message.message.content, tagName)
}

export function extractTag(html: string, tagName: string): string | null {
  if (!html.trim() || !tagName.trim()) {
    return null
  }

  // Escape special characters in the tag name
  const escapedTag = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  // Create regex pattern that handles:
  // 1. Self-closing tags
  // 2. Tags with attributes
  // 3. Nested tags of the same type
  // 4. Multiline content
  const pattern = new RegExp(
    `<${escapedTag}(?:\\s+[^>]*)?>` + // Opening tag with optional attributes
      '([\\s\\S]*?)' + // Content (non-greedy match)
      `<\\/${escapedTag}>`, // Closing tag
    'gi',
  )

  let match
  let depth = 0
  let lastIndex = 0
  const openingTag = new RegExp(`<${escapedTag}(?:\\s+[^>]*?)?>`, 'gi')
  const closingTag = new RegExp(`<\\/${escapedTag}>`, 'gi')

  while ((match = pattern.exec(html)) !== null) {
    // Check for nested tags
    const content = match[1]
    const beforeMatch = html.slice(lastIndex, match.index)

    // Reset depth counter
    depth = 0

    // Count opening tags before this match
    openingTag.lastIndex = 0
    while (openingTag.exec(beforeMatch) !== null) {
      depth++
    }

    // Count closing tags before this match
    closingTag.lastIndex = 0
    while (closingTag.exec(beforeMatch) !== null) {
      depth--
    }

    // Only include content if we're at the correct nesting level
    if (depth === 0 && content) {
      return content
    }

    lastIndex = match.index + match[0].length
  }

  return null
}

export function isNotEmptyMessage(message: Message): boolean {
  if (message.type === 'progress') {
    return true
  }

  if (typeof message.message.content === 'string') {
    return message.message.content.trim().length > 0
  }

  if (message.message.content.length === 0) {
    return false
  }

  // Skip multi-block messages for now
  if (message.message.content.length > 1) {
    return true
  }

  if (message.message.content[0]!.type !== 'text') {
    return true
  }

  return (
    message.message.content[0]!.text.trim().length > 0 &&
    message.message.content[0]!.text !== NO_CONTENT_MESSAGE &&
    message.message.content[0]!.text !== INTERRUPT_MESSAGE_FOR_TOOL_USE
  )
}

// TODO: replace this with plain UserMessage if/when PR #405 lands
type NormalizedUserMessage = {
  message: {
    content: [
      | TextBlockParam
      | ImageBlockParam
      | ToolUseBlockParam
      | ToolResultBlockParam,
    ]
    role: 'user'
  }
  type: 'user'
  uuid: UUID
}

export type NormalizedMessage =
  | NormalizedUserMessage
  | AssistantMessage
  | ProgressMessage

// Split messages, so each content block gets its own message
export function normalizeMessages(messages: Message[]): NormalizedMessage[] {
  return messages.flatMap(message => {
    if (message.type === 'progress') {
      return [message] as NormalizedMessage[]
    }
    if (typeof message.message.content === 'string') {
      return [message] as NormalizedMessage[]
    }
    const contentBlocks = message.message.content.filter(
      block =>
        !(
          block.type === 'thinking' &&
          // Skip empty/whitespace-only thinking blocks to avoid rendering blank "Thinking…" lines
          (typeof (block as any).thinking !== 'string' ||
            (block as any).thinking.trim().length === 0)
        ),
    )

    return contentBlocks.map((block, blockIndex) => {
      switch (message.type) {
        case 'assistant':
          // Keep block UUIDs stable across normalization runs.
          // When resuming from logs or other sources, uuid may be absent; fall back to the
          // assistant message id which is stable across refreshes/reloads.
          const baseSeed = String(
            (message as any).uuid ??
              (message as any).message?.id ??
              randomUUID(),
          )
          return {
            type: 'assistant',
            uuid: stableUuidFromSeed(`${baseSeed}:${blockIndex}`),
            message: {
              ...message.message,
              content: [block],
            },
            costUSD:
              (message as AssistantMessage).costUSD / contentBlocks.length,
            durationMs: (message as AssistantMessage).durationMs,
          } as NormalizedMessage
        case 'user':
          // It seems like the line below was a no-op before, but I'm not sure.
          // To check, we could throw an error if any of the following are true:
          // - message `role` does isn't `user` -- this possibility is allowed by MCP tools,
          //   though isn't supposed to happen in practice (we should fix this)
          // - message `content` is not an array -- this one is more concerning because it's
          //   not allowed by the `NormalizedUserMessage` type, but if it's happening that was
          //   probably a bug before.
          // Maybe I'm missing something? -(ab)
          // return createUserMessage([block]) as NormalizedMessage
          return message as NormalizedUserMessage
      }
    })
  })
}

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
    // Note: stop_reason === 'tool_use' is unreliable -- it's not always set correctly
    message.message.content.some(isToolUseLikeBlockParam)
  )
}

// Re-order, to move result messages to be after their tool use messages
export function reorderMessages(
  messages: NormalizedMessage[],
): NormalizedMessage[] {
  const ms: NormalizedMessage[] = []
  const toolUseMessages: ToolUseRequestMessage[] = []

  for (const message of messages) {
    // track tool use messages we've seen
    if (isToolUseRequestMessage(message)) {
      toolUseMessages.push(message)
    }

    // if it's a tool progress message...
    if (message.type === 'progress') {
      // replace any existing progress messages with this one
      const existingProgressMessage = ms.find(
        _ => _.type === 'progress' && _.toolUseID === message.toolUseID,
      )
      if (existingProgressMessage) {
        ms[ms.indexOf(existingProgressMessage)] = message
        continue
      }
      // otherwise, insert it after its tool use
      const toolUseMessage = toolUseMessages.find(
        _ => _.message.content[0]?.id === message.toolUseID,
      )
      if (toolUseMessage) {
        ms.splice(ms.indexOf(toolUseMessage) + 1, 0, message)
        continue
      }
    }

    // if it's a tool result, insert it after its tool use and progress messages
    if (
      message.type === 'user' &&
      Array.isArray(message.message.content) &&
      message.message.content[0]?.type === 'tool_result'
    ) {
      const toolUseID = (message.message.content[0] as ToolResultBlockParam)
        ?.tool_use_id

      // First check for progress messages
      const lastProgressMessage = ms.find(
        _ => _.type === 'progress' && _.toolUseID === toolUseID,
      )
      if (lastProgressMessage) {
        ms.splice(ms.indexOf(lastProgressMessage) + 1, 0, message)
        continue
      }

      // If no progress messages, check for tool use messages
      const toolUseMessage = toolUseMessages.find(
        _ => _.message.content[0]?.id === toolUseID,
      )
      if (toolUseMessage) {
        ms.splice(ms.indexOf(toolUseMessage) + 1, 0, message)
        continue
      }
    }

    // otherwise, just add it to the list
    else {
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

/**
 * Tool uses are in flight if either:
 * 1. They have a corresponding progress message and no result message
 * 2. They are the first unresoved tool use
 *
 * TODO: Find a way to harden this logic to make it more explicit
 */
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

export function normalizeMessagesForAPI(
  messages: Message[],
): (UserMessage | AssistantMessage)[] {
  function isSyntheticApiErrorMessage(message: Message): boolean {
    return (
      message.type === 'assistant' &&
      message.isApiErrorMessage === true &&
      message.message.model === '<synthetic>'
    )
  }

  function normalizeUserContent(
    content: UserMessage['message']['content'],
  ): ContentBlockParam[] {
    if (typeof content === 'string') {
      return [{ type: 'text', text: content }]
    }
    return content
  }

  function toolResultsFirst(content: ContentBlockParam[]): ContentBlockParam[] {
    const toolResults: ContentBlockParam[] = []
    const rest: ContentBlockParam[] = []
    for (const block of content) {
      if (block.type === 'tool_result') {
        toolResults.push(block)
      } else {
        rest.push(block)
      }
    }
    return [...toolResults, ...rest]
  }

  function mergeUserMessages(
    base: UserMessage,
    next: UserMessage,
  ): UserMessage {
    const baseBlocks = normalizeUserContent(base.message.content)
    const nextBlocks = normalizeUserContent(next.message.content)
    return {
      ...base,
      message: {
        ...base.message,
        content: toolResultsFirst([...baseBlocks, ...nextBlocks]),
      },
    }
  }

  function isUserToolResultMessage(message: Message): message is UserMessage {
    if (message.type !== 'user') return false
    if (!Array.isArray(message.message.content)) return false
    return message.message.content.some(block => block.type === 'tool_result')
  }

  const result: (UserMessage | AssistantMessage)[] = []
  for (const message of messages) {
    if (message.type === 'progress') continue
    if (isSyntheticApiErrorMessage(message)) continue

    switch (message.type) {
      case 'user': {
        const prev = last(result)
        if (prev?.type === 'user') {
          result[result.indexOf(prev)] = mergeUserMessages(prev, message)
        } else {
          result.push(message)
        }
        break
      }
      case 'assistant': {
        // Merge assistant messages by message id, ignoring intervening tool results
        // (reference CLI behavior).
        let merged = false
        for (let i = result.length - 1; i >= 0; i--) {
          const prev = result[i]
          if (prev.type !== 'assistant' && !isUserToolResultMessage(prev)) {
            break
          }
          if (prev.type === 'assistant') {
            if (prev.message.id === message.message.id) {
              result[i] = {
                ...prev,
                message: {
                  ...prev.message,
                  content: [
                    ...(Array.isArray(prev.message.content)
                      ? prev.message.content
                      : []),
                    ...(Array.isArray(message.message.content)
                      ? message.message.content
                      : []),
                  ],
                },
              }
              merged = true
            }
            break
          }
        }
        if (!merged) {
          result.push(message)
        }
        break
      }
    }
  }

  return result
}

// Sometimes the API returns empty messages (eg. "\n\n"). We need to filter these out,
// otherwise they will give an API error when we send them to the API next time we call query().
export function normalizeContentFromAPI(
  content: APIMessage['content'],
): APIMessage['content'] {
  const filteredContent = content.filter(
    _ => _.type !== 'text' || _.text.trim().length > 0,
  )

  if (filteredContent.length === 0) {
    return [{ type: 'text', text: NO_CONTENT_MESSAGE, citations: [] }]
  }

  return filteredContent
}

export function isEmptyMessageText(text: string): boolean {
  return (
    stripSystemMessages(text).trim() === '' ||
    text.trim() === NO_CONTENT_MESSAGE
  )
}
const STRIPPED_TAGS = [
  'commit_analysis',
  'context',
  'function_analysis',
  'pr_analysis',
]

export function stripSystemMessages(content: string): string {
  const regex = new RegExp(`<(${STRIPPED_TAGS.join('|')})>.*?</\\1>\n?`, 'gs')
  return content.replace(regex, '').trim()
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

export function getLastAssistantMessageId(
  messages: Message[],
): string | undefined {
  // Iterate from the end of the array to find the last assistant message
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message && message.type === 'assistant') {
      return message.message.id
    }
  }
  return undefined
}
