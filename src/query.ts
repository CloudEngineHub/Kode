import {
  Message as APIAssistantMessage,
  MessageParam,
  ToolUseBlock,
} from '@anthropic-ai/sdk/resources/index.mjs'
import type { UUID } from './types/common'
import type { Tool, ToolUseContext } from './Tool'
import {
  messagePairValidForBinaryFeedback,
  shouldUseBinaryFeedback,
} from '@components/binary-feedback/utils'
import { CanUseToolFn } from './hooks/useCanUseTool'
import {
  formatSystemPromptWithContext,
  queryLLM,
  queryModel,
} from '@services/claude'
import { emitReminderEvent } from '@services/systemReminder'
import { logError } from '@utils/log'
import {
  debug as debugLogger,
  markPhase,
  getCurrentRequest,
  logUserFriendly,
} from './utils/debugLogger'
import { getModelManager } from '@utils/model'
import {
  createAssistantMessage,
  createProgressMessage,
  createUserMessage,
  FullToolUseResult,
  INTERRUPT_MESSAGE,
  INTERRUPT_MESSAGE_FOR_TOOL_USE,
  REJECT_MESSAGE,
  NormalizedMessage,
  normalizeMessagesForAPI,
} from '@utils/messages'
import {
  getPlanModeSystemPromptAdditions,
  hydratePlanSlugFromMessages,
} from '@utils/planMode'
import { BashTool } from '@tools/BashTool/BashTool'
import { getCwd } from './utils/state'
import { checkAutoCompact } from './utils/autoCompactCore'

// Extended ToolUseContext for query functions
interface ExtendedToolUseContext extends ToolUseContext {
  abortController: AbortController
  options: {
    commands: any[]
    forkNumber: number
    messageLogName: string
    tools: Tool[]
    verbose: boolean
    safeMode: boolean
    maxThinkingTokens: number
    isKodingRequest?: boolean
    model?: string | import('./utils/config').ModelPointerType
  }
  readFileTimestamps: { [filename: string]: number }
  setToolJSX: (jsx: any) => void
  requestId?: string
}

export type Response = { costUSD: number; response: string }
export type UserMessage = {
  message: MessageParam
  type: 'user'
  uuid: UUID
  toolUseResult?: FullToolUseResult
  options?: {
    isKodingRequest?: boolean
    kodingContext?: string
    isCustomCommand?: boolean
    commandName?: string
    commandArgs?: string
  }
}

export type AssistantMessage = {
  costUSD: number
  durationMs: number
  message: APIAssistantMessage
  type: 'assistant'
  uuid: UUID
  isApiErrorMessage?: boolean
  responseId?: string // For GPT-5 Responses API state management
}

export type BinaryFeedbackResult =
  | { message: AssistantMessage | null; shouldSkipPermissionCheck: false }
  | { message: AssistantMessage; shouldSkipPermissionCheck: true }

export type ProgressMessage = {
  content: AssistantMessage
  normalizedMessages: NormalizedMessage[]
  siblingToolUseIDs: Set<string>
  tools: Tool[]
  toolUseID: string
  type: 'progress'
  uuid: UUID
}

// Each array item is either a single message or a message-and-response pair
export type Message = UserMessage | AssistantMessage | ProgressMessage

type ToolQueueEntry = {
  id: string
  block: ToolUseBlock
  assistantMessage: AssistantMessage
  status: 'queued' | 'executing' | 'completed' | 'yielded'
  isConcurrencySafe: boolean
  pendingProgress: ProgressMessage[]
  results?: (UserMessage | AssistantMessage)[]
  contextModifiers?: Array<(ctx: ExtendedToolUseContext) => ExtendedToolUseContext>
  promise?: Promise<void>
}

function createSyntheticToolUseErrorMessage(
  toolUseId: string,
  reason: 'user_interrupted' | 'sibling_error',
): UserMessage {
  if (reason === 'user_interrupted') {
    return createUserMessage([
      {
        type: 'tool_result',
        content: REJECT_MESSAGE,
        is_error: true,
        tool_use_id: toolUseId,
      },
    ])
  }

  return createUserMessage([
    {
      type: 'tool_result',
      content: '<tool_use_error>Sibling tool call errored</tool_use_error>',
      is_error: true,
      tool_use_id: toolUseId,
    },
  ])
}

class ToolUseQueue {
  private toolDefinitions: Tool[]
  private canUseTool: CanUseToolFn
  private tools: ToolQueueEntry[] = []
  private toolUseContext: ExtendedToolUseContext
  private hasErrored = false
  private progressAvailableResolve: (() => void) | undefined
  private siblingToolUseIDs: Set<string>
  private shouldSkipPermissionCheck?: boolean

  constructor(options: {
    toolDefinitions: Tool[]
    canUseTool: CanUseToolFn
    toolUseContext: ExtendedToolUseContext
    siblingToolUseIDs: Set<string>
    shouldSkipPermissionCheck?: boolean
  }) {
    this.toolDefinitions = options.toolDefinitions
    this.canUseTool = options.canUseTool
    this.toolUseContext = options.toolUseContext
    this.siblingToolUseIDs = options.siblingToolUseIDs
    this.shouldSkipPermissionCheck = options.shouldSkipPermissionCheck
  }

  addTool(toolUse: ToolUseBlock, assistantMessage: AssistantMessage) {
    const toolDefinition = this.toolDefinitions.find(t => t.name === toolUse.name)
    const parsedInput = toolDefinition?.inputSchema.safeParse(toolUse.input)
    const isConcurrencySafe = toolDefinition
      ? toolDefinition.isConcurrencySafe(
          parsedInput?.success ? (parsedInput.data as any) : undefined,
        )
      : false

    this.tools.push({
      id: toolUse.id,
      block: toolUse,
      assistantMessage,
      status: 'queued',
      isConcurrencySafe,
      pendingProgress: [],
    })

    void this.processQueue()
  }

  private canExecuteTool(isConcurrencySafe: boolean) {
    const executing = this.tools.filter(t => t.status === 'executing')
    return (
      executing.length === 0 ||
      (isConcurrencySafe && executing.every(t => t.isConcurrencySafe))
    )
  }

  private async processQueue() {
    for (const entry of this.tools) {
      if (entry.status !== 'queued') continue

      if (this.canExecuteTool(entry.isConcurrencySafe)) {
        await this.executeTool(entry)
      } else if (!entry.isConcurrencySafe) {
        break
      }
    }
  }

  private getAbortReason(): 'sibling_error' | 'user_interrupted' | null {
    if (this.hasErrored) return 'sibling_error'
    if (this.toolUseContext.abortController.signal.aborted) return 'user_interrupted'
    return null
  }

  private async executeTool(entry: ToolQueueEntry) {
    entry.status = 'executing'

    const results: (UserMessage | AssistantMessage)[] = []
    const contextModifiers: Array<
      (ctx: ExtendedToolUseContext) => ExtendedToolUseContext
    > = []

    const promise = (async () => {
      const abortReason = this.getAbortReason()
      if (abortReason) {
        results.push(createSyntheticToolUseErrorMessage(entry.id, abortReason))
        entry.results = results
        entry.contextModifiers = contextModifiers
        entry.status = 'completed'
        return
      }

      const generator = runToolUse(
        entry.block,
        this.siblingToolUseIDs,
        entry.assistantMessage,
        this.canUseTool,
        this.toolUseContext,
        this.shouldSkipPermissionCheck,
      )

      let toolErrored = false

      for await (const message of generator) {
        const reason = this.getAbortReason()
        if (reason && !toolErrored) {
          results.push(createSyntheticToolUseErrorMessage(entry.id, reason))
          break
        }

        if (
          message.type === 'user' &&
          Array.isArray(message.message.content) &&
          message.message.content.some(
            block => block.type === 'tool_result' && block.is_error === true,
          )
        ) {
          this.hasErrored = true
          toolErrored = true
        }

        if (message.type === 'progress') {
          entry.pendingProgress.push(message)
          if (this.progressAvailableResolve) {
            this.progressAvailableResolve()
            this.progressAvailableResolve = undefined
          }
        } else {
          results.push(message)

          if (
            message.type === 'user' &&
            message.toolUseResult?.contextModifier
          ) {
            contextModifiers.push(
              message.toolUseResult.contextModifier.modifyContext as any,
            )
          }
        }
      }

      entry.results = results
      entry.contextModifiers = contextModifiers
      entry.status = 'completed'

      if (!entry.isConcurrencySafe && contextModifiers.length > 0) {
        for (const modifyContext of contextModifiers) {
          this.toolUseContext = modifyContext(this.toolUseContext)
        }
      }
    })()

    entry.promise = promise
    promise.finally(() => {
      void this.processQueue()
    })
  }

  private *getCompletedResults(): Generator<Message, void> {
    for (const entry of this.tools) {
      while (entry.pendingProgress.length > 0) {
        yield entry.pendingProgress.shift()!
      }

      if (entry.status === 'yielded') continue

      if (entry.status === 'completed' && entry.results) {
        entry.status = 'yielded'
        for (const message of entry.results) {
          yield message
        }
      } else if (entry.status === 'executing' && !entry.isConcurrencySafe) {
        break
      }
    }
  }

  private hasPendingProgress() {
    return this.tools.some(t => t.pendingProgress.length > 0)
  }

  private hasCompletedResults() {
    return this.tools.some(t => t.status === 'completed')
  }

  private hasExecutingTools() {
    return this.tools.some(t => t.status === 'executing')
  }

  private hasUnfinishedTools() {
    return this.tools.some(t => t.status !== 'yielded')
  }

  async *getRemainingResults(): AsyncGenerator<Message, void> {
    while (this.hasUnfinishedTools()) {
      await this.processQueue()

      for (const message of this.getCompletedResults()) {
        yield message
      }

      if (
        this.hasExecutingTools() &&
        !this.hasCompletedResults() &&
        !this.hasPendingProgress()
      ) {
        const promises = this.tools
          .filter(t => t.status === 'executing' && t.promise)
          .map(t => t.promise!)

        const progressPromise = new Promise<void>(resolve => {
          this.progressAvailableResolve = resolve
        })

        if (promises.length > 0) {
          await Promise.race([...promises, progressPromise])
        }
      }
    }

    for (const message of this.getCompletedResults()) {
      yield message
    }
  }

  getUpdatedContext() {
    return this.toolUseContext
  }
}

// Returns a message if we got one, or `null` if the user cancelled
async function queryWithBinaryFeedback(
  toolUseContext: ExtendedToolUseContext,
  getAssistantResponse: () => Promise<AssistantMessage>,
  getBinaryFeedbackResponse?: (
    m1: AssistantMessage,
    m2: AssistantMessage,
  ) => Promise<BinaryFeedbackResult>,
): Promise<BinaryFeedbackResult> {
  if (
    process.env.USER_TYPE !== 'ant' ||
    !getBinaryFeedbackResponse ||
    !(await shouldUseBinaryFeedback())
  ) {
    const assistantMessage = await getAssistantResponse()
    if (toolUseContext.abortController.signal.aborted) {
      return { message: null, shouldSkipPermissionCheck: false }
    }
    return { message: assistantMessage, shouldSkipPermissionCheck: false }
  }
  const [m1, m2] = await Promise.all([
    getAssistantResponse(),
    getAssistantResponse(),
  ])
  if (toolUseContext.abortController.signal.aborted) {
    return { message: null, shouldSkipPermissionCheck: false }
  }
  if (m2.isApiErrorMessage) {
    // If m2 is an error, we might as well return m1, even if it's also an error --
    // the UI will display it as an error as it would in the non-feedback path.
    return { message: m1, shouldSkipPermissionCheck: false }
  }
  if (m1.isApiErrorMessage) {
    return { message: m2, shouldSkipPermissionCheck: false }
  }
  if (!messagePairValidForBinaryFeedback(m1, m2)) {
    return { message: m1, shouldSkipPermissionCheck: false }
  }
  return await getBinaryFeedbackResponse(m1, m2)
}

/**
 * The rules of thinking are lengthy and fortuitous. They require plenty of thinking
 * of most long duration and deep meditation for a wizard to wrap one's noggin around.
 *
 * The rules follow:
 * 1. A message that contains a thinking or redacted_thinking block must be part of a query whose max_thinking_length > 0
 * 2. A thinking block may not be the last message in a block
 * 3. Thinking blocks must be preserved for the duration of an assistant trajectory (a single turn, or if that turn includes a tool_use block then also its subsequent tool_result and the following assistant message)
 *
 * Heed these rules well, young wizard. For they are the rules of thinking, and
 * the rules of thinking are the rules of the universe. If ye does not heed these
 * rules, ye will be punished with an entire day of debugging and hair pulling.
 */
export async function* query(
  messages: Message[],
  systemPrompt: string[],
  context: { [k: string]: string },
  canUseTool: CanUseToolFn,
  toolUseContext: ExtendedToolUseContext,
  getBinaryFeedbackResponse?: (
    m1: AssistantMessage,
    m2: AssistantMessage,
  ) => Promise<BinaryFeedbackResult>,
): AsyncGenerator<Message, void> {
  const currentRequest = getCurrentRequest()

  markPhase('QUERY_INIT')

  // Auto-compact check
  const { messages: processedMessages, wasCompacted } = await checkAutoCompact(
    messages,
    toolUseContext,
  )
  if (wasCompacted) {
    messages = processedMessages
  }

  markPhase('SYSTEM_PROMPT_BUILD')

  // Best-effort: recover plan slug from previous tool results (for resume flows).
  hydratePlanSlugFromMessages(messages as any[], toolUseContext)
  
  const { systemPrompt: fullSystemPrompt, reminders } =
    formatSystemPromptWithContext(systemPrompt, context, toolUseContext.agentId)

  // Claude Code parity: plan mode reminders are injected as system-level guidance.
  const planModeAdditions = getPlanModeSystemPromptAdditions(
    messages as any[],
    toolUseContext,
  )
  if (planModeAdditions.length > 0) {
    fullSystemPrompt.push(...planModeAdditions)
  }

  // Emit session startup event
  emitReminderEvent('session:startup', {
    agentId: toolUseContext.agentId,
    messages: messages.length,
    timestamp: Date.now(),
  })

  // Inject reminders into the latest user message
  if (reminders && messages.length > 0) {
    // Find the last user message
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg?.type === 'user') {
        const lastUserMessage = msg as UserMessage
        messages[i] = {
          ...lastUserMessage,
          message: {
            ...lastUserMessage.message,
            content:
              typeof lastUserMessage.message.content === 'string'
                ? reminders + lastUserMessage.message.content
                : [
                    ...(Array.isArray(lastUserMessage.message.content)
                      ? lastUserMessage.message.content
                      : []),
                    { type: 'text', text: reminders },
                  ],
          },
        }
        break
      }
    }
  }

  markPhase('LLM_PREPARATION')

  function getAssistantResponse() {
    return queryLLM(
      normalizeMessagesForAPI(messages),
      fullSystemPrompt,
      toolUseContext.options.maxThinkingTokens,
      toolUseContext.options.tools,
      toolUseContext.abortController.signal,
      {
        safeMode: toolUseContext.options.safeMode ?? false,
        model: toolUseContext.options.model || 'main',
        prependCLISysprompt: true,
        toolUseContext: toolUseContext,
      },
    )
  }

  const result = await queryWithBinaryFeedback(
    toolUseContext,
    getAssistantResponse,
    getBinaryFeedbackResponse,
  )

  // If request was cancelled, return immediately with interrupt message  
  if (toolUseContext.abortController.signal.aborted) {
    yield createAssistantMessage(INTERRUPT_MESSAGE)
    return
  }

  if (result.message === null) {
    yield createAssistantMessage(INTERRUPT_MESSAGE)
    return
  }

  const assistantMessage = result.message
  const shouldSkipPermissionCheck = result.shouldSkipPermissionCheck

  yield assistantMessage

  // @see https://docs.anthropic.com/en/docs/build-with-claude/tool-use
  // Note: stop_reason === 'tool_use' is unreliable -- it's not always set correctly
  const toolUseMessages = assistantMessage.message.content.filter(
    _ => _.type === 'tool_use',
  )

  // If there's no more tool use, we're done
  if (!toolUseMessages.length) {
    return
  }
  const siblingToolUseIDs = new Set<string>(
    toolUseMessages.map(_ => String((_ as any).id)),
  )
  const toolQueue = new ToolUseQueue({
    toolDefinitions: toolUseContext.options.tools,
    canUseTool,
    toolUseContext,
    siblingToolUseIDs,
    shouldSkipPermissionCheck,
  })

  for (const toolUse of toolUseMessages) {
    toolQueue.addTool(toolUse, assistantMessage)
  }

  const toolMessagesForNextTurn: (UserMessage | AssistantMessage)[] = []
  for await (const message of toolQueue.getRemainingResults()) {
    yield message
    if (message.type !== 'progress') {
      toolMessagesForNextTurn.push(message as UserMessage | AssistantMessage)
    }
  }

  toolUseContext = toolQueue.getUpdatedContext()

  if (toolUseContext.abortController.signal.aborted) {
    yield createAssistantMessage(INTERRUPT_MESSAGE_FOR_TOOL_USE)
    return
  }

  // Recursive query

  try {
    yield* await query(
      [...messages, assistantMessage, ...toolMessagesForNextTurn],
      systemPrompt,
      context,
      canUseTool,
      toolUseContext,
      getBinaryFeedbackResponse,
    )
  } catch (error) {
    // Re-throw the error to maintain the original behavior
    throw error
  }
}

export async function* runToolUse(
  toolUse: ToolUseBlock,
  siblingToolUseIDs: Set<string>,
  assistantMessage: AssistantMessage,
  canUseTool: CanUseToolFn,
  toolUseContext: ExtendedToolUseContext,
  shouldSkipPermissionCheck?: boolean,
): AsyncGenerator<Message, void> {
  const currentRequest = getCurrentRequest()

  // 🔍 Debug: 工具调用开始
  debugLogger.flow('TOOL_USE_START', {
    toolName: toolUse.name,
    toolUseID: toolUse.id,
    inputSize: JSON.stringify(toolUse.input).length,
    siblingToolCount: siblingToolUseIDs.size,
    shouldSkipPermissionCheck: !!shouldSkipPermissionCheck,
    requestId: currentRequest?.id,
  })

  logUserFriendly(
    'TOOL_EXECUTION',
    {
      toolName: toolUse.name,
      action: 'Starting',
      target: toolUse.input ? Object.keys(toolUse.input).join(', ') : '',
    },
    currentRequest?.id,
  )


  

  const toolName = toolUse.name
  const tool = toolUseContext.options.tools.find(t => t.name === toolName)

  // Check if the tool exists
  if (!tool) {
    debugLogger.error('TOOL_NOT_FOUND', {
      requestedTool: toolName,
      availableTools: toolUseContext.options.tools.map(t => t.name),
      toolUseID: toolUse.id,
      requestId: currentRequest?.id,
    })

    

    yield createUserMessage([
      {
        type: 'tool_result',
        content: `Error: No such tool available: ${toolName}`,
        is_error: true,
        tool_use_id: toolUse.id,
      },
    ])
    return
  }

  const toolInput = toolUse.input as Record<string, unknown>

  debugLogger.flow('TOOL_VALIDATION_START', {
    toolName: tool.name,
    toolUseID: toolUse.id,
    inputKeys: Object.keys(toolInput),
    requestId: currentRequest?.id,
  })

  try {
    for await (const message of checkPermissionsAndCallTool(
      tool,
      toolUse.id,
      siblingToolUseIDs,
      toolInput,
      toolUseContext,
      canUseTool,
      assistantMessage,
      shouldSkipPermissionCheck,
    )) {
      yield message
    }
  } catch (e) {
    logError(e)
    
    // 🔧 Even on error, ensure we yield a tool result to clear UI state
    const errorMessage = createUserMessage([
      {
        type: 'tool_result',
        content: `Tool execution failed: ${e instanceof Error ? e.message : String(e)}`,
        is_error: true,
        tool_use_id: toolUse.id,
      },
    ])
    yield errorMessage
  }
}

// TODO: Generalize this to all tools
export function normalizeToolInput(
  tool: Tool,
  input: Record<string, unknown>,
): Record<string, unknown> {
  switch (tool) {
    case BashTool: {
      const parsed = BashTool.inputSchema.parse(input) // already validated upstream, won't throw
      const { command, timeout, description, run_in_background, dangerouslyDisableSandbox } =
        parsed
      return {
        command: command.replace(`cd ${getCwd()} && `, '').replace(/\\\\;/g, '\\;'),
        ...(timeout !== undefined ? { timeout } : {}),
        ...(description ? { description } : {}),
        ...(run_in_background ? { run_in_background } : {}),
        ...(dangerouslyDisableSandbox ? { dangerouslyDisableSandbox } : {}),
      }
    }
    default:
      return input
  }
}

async function* checkPermissionsAndCallTool(
  tool: Tool,
  toolUseID: string,
  siblingToolUseIDs: Set<string>,
  input: Record<string, unknown>,
  context: ToolUseContext,
  canUseTool: CanUseToolFn,
  assistantMessage: AssistantMessage,
  shouldSkipPermissionCheck?: boolean,
): AsyncGenerator<Message, void> {
  // Validate input types with zod
  // (surprisingly, the model is not great at generating valid input)
  const isValidInput = tool.inputSchema.safeParse(input)
  if (!isValidInput.success) {
    // Create a more helpful error message for common cases
    let errorMessage = `InputValidationError: ${isValidInput.error.message}`
    
    // Special handling for the "Read" tool (FileReadTool) being called with empty parameters
    if (tool.name === 'Read' && Object.keys(input).length === 0) {
      errorMessage = `Error: The Read tool requires a 'file_path' parameter to specify which file to read. Please provide the absolute path to the file you want to read. For example: {"file_path": "/path/to/file.txt"}`
    }
    
    
    yield createUserMessage([
      {
        type: 'tool_result',
        content: errorMessage,
        is_error: true,
        tool_use_id: toolUseID,
      },
    ])
    return
  }

  const normalizedInput = normalizeToolInput(tool, isValidInput.data)

  // Validate input values. Each tool has its own validation logic
  const isValidCall = await tool.validateInput?.(
    normalizedInput as never,
    context,
  )
  if (isValidCall?.result === false) {
    yield createUserMessage([
      {
        type: 'tool_result',
        content: isValidCall!.message,
        is_error: true,
        tool_use_id: toolUseID,
      },
    ])
    return
  }

  // Check whether we have permission to use the tool,
  // and ask the user for permission if we don't
  const permissionResult = shouldSkipPermissionCheck
    ? ({ result: true } as const)
    : await canUseTool(tool, normalizedInput, context, assistantMessage)
  if (permissionResult.result === false) {
    yield createUserMessage([
      {
        type: 'tool_result',
        content: permissionResult.message,
        is_error: true,
        tool_use_id: toolUseID,
      },
    ])
    return
  }

  // Call the tool
  try {
    const generator = tool.call(normalizedInput as never, {
      ...context,
      toolUseId: toolUseID,
    })
    for await (const result of generator) {
      switch (result.type) {
        case 'result':
          {
            const content =
              result.resultForAssistant ??
              tool.renderResultForAssistant(result.data as never)

            yield createUserMessage(
              [
                {
                  type: 'tool_result',
                  content: content as any,
                  tool_use_id: toolUseID,
                },
              ],
              {
                data: result.data,
                resultForAssistant: content as any,
                ...(Array.isArray(result.newMessages)
                  ? { newMessages: result.newMessages as any }
                  : {}),
                ...(result.contextModifier
                  ? { contextModifier: result.contextModifier as any }
                  : {}),
              },
            )

            if (Array.isArray(result.newMessages)) {
              for (const message of result.newMessages) {
                if (
                  message &&
                  typeof message === 'object' &&
                  'type' in (message as any)
                ) {
                  yield message as any
                }
              }
            }
          }
          return
        case 'progress':
          
          yield createProgressMessage(
            toolUseID,
            siblingToolUseIDs,
            result.content,
            result.normalizedMessages || [],
            result.tools || [],
          )
          break
      }
    }
  } catch (error) {
    const content = formatError(error)
    logError(error)
    
    yield createUserMessage([
      {
        type: 'tool_result',
        content,
        is_error: true,
        tool_use_id: toolUseID,
      },
    ])
  }
}

function formatError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error)
  }
  const parts = [error.message]
  if ('stderr' in error && typeof error.stderr === 'string') {
    parts.push(error.stderr)
  }
  if ('stdout' in error && typeof error.stdout === 'string') {
    parts.push(error.stdout)
  }
  const fullMessage = parts.filter(Boolean).join('\n')
  if (fullMessage.length <= 10000) {
    return fullMessage
  }
  const halfLength = 5000
  const start = fullMessage.slice(0, halfLength)
  const end = fullMessage.slice(-halfLength)
  return `${start}\n\n... [${fullMessage.length - 10000} characters truncated] ...\n\n${end}`
}
