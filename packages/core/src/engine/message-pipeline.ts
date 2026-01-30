import type { CanUseToolFn } from '#core/permissions/canUseTool'
import { queryLLM } from '#core/ai/llmLazy'
import { getTotalCost } from '#core/cost-tracker'
import { MaxBudgetUsdExceededError } from '#core/errors/maxBudgetUsd'
import { MaxTurnsExceededError } from '#core/errors/maxTurns'
import { formatSystemPromptWithContext } from '#core/services/systemPrompt'
import { emitReminderEvent } from '#core/services/systemReminder'
import { addNotification } from '#core/services/notificationCenter'
import '#core/services/workspaceSafety'
import { markPhase } from '#core/utils/debugLogger'
import {
  createAssistantMessage,
  INTERRUPT_MESSAGE,
  INTERRUPT_MESSAGE_FOR_TOOL_USE,
  normalizeMessagesForAPI,
} from '#core/utils/messages'
import {
  getPlanModeSystemPromptAdditions,
  hydratePlanSlugFromMessages,
} from '#core/utils/planMode'
import { setRequestStatus } from '#core/utils/requestStatus'
import {
  BunShell,
  renderBackgroundShellStatusAttachment,
  renderBashNotification,
} from '#runtime/shell'
import { getCwd } from '#core/utils/state'
import { getEffectiveSessionId } from '#core/utils/sessionId'
import { checkAutoCompact } from '#core/utils/autoCompactCore'
import { checkMicroCompact } from '#core/utils/microCompactCore'
import { asRecord } from '#core/hooks/types'
import {
  drainHookSystemPromptAdditions,
  getHookTranscriptPath,
  queueHookAdditionalContexts,
  queueHookSystemMessages,
  runStopHooks,
  runUserPromptSubmitHooks,
  updateHookTranscriptForMessages,
} from '#core/utils/kodeHooks'
import { queryWithBinaryFeedback } from './query-executor'
import { ToolUseQueue } from './pipeline/tool-use-queue'
import type {
  AssistantMessage,
  BinaryFeedbackResult,
  ExtendedToolUseContext,
  Message,
  UserMessage,
} from './pipeline/types'
import { isToolUseLikeBlock } from './pipeline/types'
export type {
  AssistantMessage,
  BinaryFeedbackResult,
  ExtendedToolUseContext,
  Message,
  ProgressMessage,
  Response,
  UserMessage,
} from './pipeline/types'
export { __isToolUseLikeBlockForTests } from './pipeline/types'
export { __ToolUseQueueForTests } from './pipeline/tool-use-queue'
export { runToolUse } from './pipeline/tool-use'
export { normalizeToolInput } from './pipeline/tool-input'

export async function* messagePipeline(
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
  yield* messagePipelineCore(
    messages,
    systemPrompt,
    context,
    canUseTool,
    toolUseContext,
    getBinaryFeedbackResponse,
  )
}
async function* messagePipelineCore(
  messages: Message[],
  systemPrompt: string[],
  context: { [k: string]: string },
  canUseTool: CanUseToolFn,
  toolUseContext: ExtendedToolUseContext,
  getBinaryFeedbackResponse?: (
    m1: AssistantMessage,
    m2: AssistantMessage,
  ) => Promise<BinaryFeedbackResult>,
  hookState?: { stopHookActive?: boolean; stopHookAttempts?: number },
): AsyncGenerator<Message, void> {
  setRequestStatus({ kind: 'thinking' })

  try {
    markPhase('QUERY_INIT')
    const stopHookActive = hookState?.stopHookActive === true
    const stopHookAttempts = hookState?.stopHookAttempts ?? 0

    const maxTurns = toolUseContext.options.maxTurns
    const normalizedMaxTurns =
      typeof maxTurns === 'number' && Number.isFinite(maxTurns) && maxTurns > 0
        ? Math.trunc(maxTurns)
        : undefined

    const turnsUsed = (() => {
      const raw = toolUseContext.turnCount
      if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) {
        return 0
      }
      return Math.trunc(raw)
    })()
    toolUseContext.turnCount = turnsUsed

    if (normalizedMaxTurns !== undefined && turnsUsed >= normalizedMaxTurns) {
      throw new MaxTurnsExceededError({
        maxTurns: normalizedMaxTurns,
        turnCount: turnsUsed,
      })
    }

    const maxBudgetUsd = toolUseContext.options.maxBudgetUsd
    if (
      typeof maxBudgetUsd === 'number' &&
      Number.isFinite(maxBudgetUsd) &&
      maxBudgetUsd > 0
    ) {
      const totalCostUsd = getTotalCost()
      if (totalCostUsd >= maxBudgetUsd) {
        throw new MaxBudgetUsdExceededError({ maxBudgetUsd, totalCostUsd })
      }
    }

    // Micro-compact check (tool-result offload before auto-compact)
    {
      const microOutcome = await checkMicroCompact(messages, toolUseContext)
      if (microOutcome.boundaryMessage) {
        messages = microOutcome.messages
        yield microOutcome.boundaryMessage
        messages = [...messages, microOutcome.boundaryMessage]
      } else {
        messages = microOutcome.messages
      }
    }

    // Auto-compact check
    const { messages: processedMessages, wasCompacted } =
      await checkAutoCompact(messages, toolUseContext)
    if (wasCompacted) {
      messages = processedMessages
    }

    // Compatibility: task-notification + background_shell_status attachments.
    // We inject these as synthetic assistant messages so the model can decide when to call TaskOutput.
    if (toolUseContext.agentId === 'main') {
      const shell = BunShell.getInstance()

      const notifications = shell.flushBashNotifications()
      for (const notification of notifications) {
        const status = notification.status
        const exitCode = notification.exitCode
        const summarySuffix =
          status === 'completed'
            ? `completed${exitCode !== undefined ? ` (exit ${exitCode})` : ''}`
            : status === 'failed'
              ? `failed${exitCode !== undefined ? ` (exit ${exitCode})` : ''}`
              : 'was killed'

        addNotification({
          title: 'Background bash',
          message: `${notification.description} — ${summarySuffix}. Output: ${notification.outputFile}`,
          source: 'system',
          kind: status === 'failed' ? 'error' : 'info',
        })

        const text = renderBashNotification(notification)
        if (text.trim().length === 0) continue
        const msg = createAssistantMessage(text)
        messages = [...messages, msg]
        yield msg
      }

      const attachments = shell.flushBackgroundShellStatusAttachments()
      for (const attachment of attachments) {
        const text = renderBackgroundShellStatusAttachment(attachment)
        if (text.trim().length === 0) continue
        const msg = createAssistantMessage(
          `<tool-progress>${text}</tool-progress>`,
        )
        messages = [...messages, msg]
        yield msg
      }
    }

    // Hooks: keep an up-to-date transcript for hook scripts.
    updateHookTranscriptForMessages(toolUseContext, messages)

    // Hooks: UserPromptSubmit
    {
      const last = messages[messages.length - 1]
      let userPromptText: string | null = null
      if (last?.type === 'user') {
        const content = last.message.content
        if (typeof content === 'string') {
          userPromptText = content
        } else if (Array.isArray(content)) {
          const hasToolResult = content.some(
            (b: any) => b && typeof b === 'object' && b.type === 'tool_result',
          )
          if (!hasToolResult) {
            userPromptText = content
              .filter(
                (b: any) => b && typeof b === 'object' && b.type === 'text',
              )
              .map((b: any) => String(b.text ?? ''))
              .join('')
          }
        }
      }

      if (userPromptText !== null) {
        // Keep a stable copy of the user's last prompt (pre-reminder injection) so
        // tools can do intent-alignment checks against the actual user request.
        toolUseContext.options.lastUserPrompt = userPromptText

        const promptOutcome = await runUserPromptSubmitHooks({
          prompt: userPromptText,
          permissionMode: toolUseContext.options?.toolPermissionContext?.mode,
          cwd: getCwd(),
          transcriptPath: getHookTranscriptPath(toolUseContext),
          safeMode: toolUseContext.options?.safeMode ?? false,
          signal: toolUseContext.abortController.signal,
        })

        queueHookSystemMessages(toolUseContext, promptOutcome.systemMessages)
        queueHookAdditionalContexts(
          toolUseContext,
          promptOutcome.additionalContexts,
        )

        if (promptOutcome.decision === 'block') {
          yield createAssistantMessage(promptOutcome.message)
          return
        }
      }
    }

    markPhase('SYSTEM_PROMPT_BUILD')

    // Best-effort: recover plan slug from previous tool results (for resume flows).
    hydratePlanSlugFromMessages(messages, toolUseContext)

    const { systemPrompt: fullSystemPrompt, reminders } =
      formatSystemPromptWithContext(
        systemPrompt,
        context,
        toolUseContext.agentId,
      )

    // Default behavior: plan mode reminders are injected as system-level guidance.
    const planModeAdditions = getPlanModeSystemPromptAdditions(
      messages,
      toolUseContext,
    )
    if (planModeAdditions.length > 0) {
      fullSystemPrompt.push(...planModeAdditions)
    }

    const hookAdditions = drainHookSystemPromptAdditions(toolUseContext)
    if (hookAdditions.length > 0) {
      fullSystemPrompt.push(...hookAdditions)
    }

    // Inject custom system prompt additions (e.g., output style) for main agent
    if (toolUseContext.agentId === 'main') {
      const customAdditions =
        toolUseContext.options.getCustomSystemPromptAdditions?.() ?? []
      if (customAdditions.length > 0) {
        fullSystemPrompt.push(...customAdditions)
      }
    }

    // Emit session startup event (idempotent within the reminder service)
    emitReminderEvent('session:startup', {
      agentId: toolUseContext.agentId,
      sessionId: getEffectiveSessionId(),
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
    toolUseContext.turnCount = turnsUsed + 1
    const shouldSkipPermissionCheck = result.shouldSkipPermissionCheck

    // @see https://docs.anthropic.com/en/docs/build-with-claude/tool-use
    // Note: stop_reason === 'tool_use' is unreliable -- it's not always set correctly
    const toolUseMessages =
      assistantMessage.message.content.filter(isToolUseLikeBlock)

    // If there's no more tool use, we're done
    if (!toolUseMessages.length) {
      const stopHookEvent =
        toolUseContext.agentId && toolUseContext.agentId !== 'main'
          ? ('SubagentStop' as const)
          : ('Stop' as const)
      const record = asRecord(assistantMessage.message)
      const stopReason =
        (record && typeof record.stop_reason === 'string'
          ? record.stop_reason
          : '') ||
        (record && typeof record.stopReason === 'string'
          ? record.stopReason
          : '') ||
        'end_turn'

      const stopOutcome = await runStopHooks({
        hookEvent: stopHookEvent,
        reason: String(stopReason ?? ''),
        agentId: toolUseContext.agentId,
        permissionMode: toolUseContext.options?.toolPermissionContext?.mode,
        cwd: getCwd(),
        transcriptPath: getHookTranscriptPath(toolUseContext),
        safeMode: toolUseContext.options?.safeMode ?? false,
        stopHookActive,
        signal: toolUseContext.abortController.signal,
      })

      if (stopOutcome.systemMessages.length > 0) {
        queueHookSystemMessages(toolUseContext, stopOutcome.systemMessages)
      }
      if (stopOutcome.additionalContexts.length > 0) {
        queueHookAdditionalContexts(
          toolUseContext,
          stopOutcome.additionalContexts,
        )
      }

      if (stopOutcome.decision === 'block') {
        queueHookSystemMessages(toolUseContext, [stopOutcome.message])
        const MAX_STOP_HOOK_ATTEMPTS = 5
        if (stopHookAttempts < MAX_STOP_HOOK_ATTEMPTS) {
          yield* await messagePipelineCore(
            [...messages, assistantMessage],
            systemPrompt,
            context,
            canUseTool,
            toolUseContext,
            getBinaryFeedbackResponse,
            {
              stopHookActive: true,
              stopHookAttempts: stopHookAttempts + 1,
            },
          )
          return
        }
      }

      yield assistantMessage
      return
    }

    yield assistantMessage
    const siblingToolUseIDs = new Set<string>(toolUseMessages.map(_ => _.id))
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
      yield* await messagePipelineCore(
        [...messages, assistantMessage, ...toolMessagesForNextTurn],
        systemPrompt,
        context,
        canUseTool,
        toolUseContext,
        getBinaryFeedbackResponse,
        hookState,
      )
    } catch (error) {
      // Re-throw the error to maintain the original behavior
      throw error
    }
  } finally {
    setRequestStatus({ kind: 'idle' })
  }
}

export * from '../query/agentEvents'
