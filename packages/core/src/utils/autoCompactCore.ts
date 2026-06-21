import { Message } from '#core/query'
import { estimateTokens } from './tokens'
import { getMessagesSetter } from '#core/messages'
import { getContext } from '#core/context'
import { getCodeStyle } from '#core/utils/style'
import { resetFileFreshnessSession } from '#core/services/fileFreshness'
import {
  createUserMessage,
  normalizeMessagesForAPI,
} from '#core/utils/messages'
import { queryLLM } from '#core/ai/llmLazy'
import { selectAndReadFiles } from './fileRecoveryCore'
import { addLineNumbers } from './file'
import { getModelManager } from './model'
import { debug as debugLogger } from '#core/utils/debugLogger'
import { logError } from '#core/utils/log'
import {
  getHookTranscriptPath,
  runPreCompactHooks,
} from '#core/utils/kodeHooks'
import {
  formatCompactionMcpSnapshot,
  formatCompactionSkillCommandSnapshot,
  formatCompactionTaskListSnapshot,
} from '#core/utils/compactionSnapshots'
import {
  calculateAutoCompactThresholds,
  getEffectiveConversationContextLimit,
} from './autoCompactThreshold'
import {
  appendSessionJsonlFromMessage,
  appendSessionSummaryRecord,
} from '#protocol/utils/kodeAgentSessionLog'
import { getOriginalCwd } from '#core/utils/state'
import { getPlanConversationKey, readPlanFile } from '#core/utils/planMode'

/**
 * Retrieves the context length for a model pointer (e.g. "main", "gpt-4.1", ...).
 */
function getConversationContextLimit(modelPointer: string): number {
  try {
    const modelManager = getModelManager()
    const resolution = modelManager.resolveModelWithInfo(modelPointer)
    const modelProfile = resolution.success ? resolution.profile : null

    if (modelProfile?.contextLength) {
      return modelProfile.contextLength
    }

    // Fallback to main (then to a reasonable default)
    const main = modelManager.resolveModelWithInfo('main')
    if (main.success && main.profile?.contextLength) {
      return main.profile.contextLength
    }

    return 200_000
  } catch (error) {
    return 200_000
  }
}

function getActiveConversationModelPointer(toolUseContext: any): string {
  const raw = toolUseContext?.options?.model
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  return 'main'
}

const COMPRESSION_PROMPT_BASE = `Please provide a comprehensive summary of our conversation structured as follows:

## Technical Context
Development environment, tools, frameworks, and configurations in use. Programming languages, libraries, and technical constraints. File structure, directory organization, and project architecture.

## Project Overview  
Main project goals, features, and scope. Key components, modules, and their relationships. Data models, APIs, and integration patterns.

## Code Changes
Files created, modified, or analyzed during our conversation. Specific code implementations, functions, and algorithms added. Configuration changes and structural modifications.

## Debugging & Issues
Problems encountered and their root causes. Solutions implemented and their effectiveness. Error messages, logs, and diagnostic information.

## Current Status
What we just completed successfully. Current state of the codebase and any ongoing work. Test results, validation steps, and verification performed.

## Pending Tasks
Immediate next steps and priorities. Planned features, improvements, and refactoring. Known issues, technical debt, and areas needing attention.

## User Preferences
Coding style, formatting, and organizational preferences. Communication patterns and feedback style. Tool choices and workflow preferences.

## Key Decisions
Important technical decisions made and their rationale. Alternative approaches considered and why they were rejected. Trade-offs accepted and their implications.

Focus on information essential for continuing the conversation effectively, including specific details about code, files, errors, and plans.`

/**
 * Determines if auto-compact should trigger based on token usage
 * Uses the active conversation model pointer (what the user selected) so we compact
 * before exceeding that model's context window.
 */
async function shouldAutoCompact(
  messages: Message[],
  toolUseContext: any,
): Promise<boolean> {
  if (messages.length < 3) return false

  const tokenCount = estimateTokens(messages)
  const activeModelPointer = getActiveConversationModelPointer(toolUseContext)
  const contextLimit = getConversationContextLimit(activeModelPointer)
  const effectiveContextLimit =
    getEffectiveConversationContextLimit(contextLimit)
  const { isAboveAutoCompactThreshold } = calculateAutoCompactThresholds(
    tokenCount,
    effectiveContextLimit,
  )

  return isAboveAutoCompactThreshold
}

/**
 * Main entry point for automatic context compression
 *
 * This function is called before each query to check if the conversation
 * has grown too large and needs compression. When triggered, it:
 * - Generates a structured summary of the conversation using the main model
 * - Recovers recently accessed files to maintain development context
 * - Resets conversation state while preserving essential information
 *
 * Uses the main model for compression tasks to ensure high-quality summaries
 *
 * @param messages Current conversation messages
 * @param toolUseContext Execution context with model and tool configuration
 * @returns Updated messages (compressed if needed) and compression status
 */
export async function checkAutoCompact(
  messages: Message[],
  toolUseContext: any,
): Promise<{ messages: Message[]; wasCompacted: boolean }> {
  if (!(await shouldAutoCompact(messages, toolUseContext))) {
    return { messages, wasCompacted: false }
  }

  try {
    const pendingUserMessage =
      messages.length > 0 && messages[messages.length - 1]?.type === 'user'
        ? (messages[messages.length - 1] ?? null)
        : null
    const history = pendingUserMessage ? messages.slice(0, -1) : messages

    const tokenCountBefore = estimateTokens(history)
    const activeModelPointer = getActiveConversationModelPointer(toolUseContext)
    const contextLimit = getConversationContextLimit(activeModelPointer)
    const effectiveContextLimit =
      getEffectiveConversationContextLimit(contextLimit)

    const preCompactOutcome = await runPreCompactHooks({
      trigger: 'auto',
      tokenCountBefore,
      contextLimit: effectiveContextLimit,
      model: activeModelPointer,
      permissionMode: toolUseContext?.options?.toolPermissionContext?.mode,
      cwd: getOriginalCwd(),
      transcriptPath: getHookTranscriptPath(toolUseContext),
      safeMode: toolUseContext?.options?.safeMode ?? false,
      signal: toolUseContext?.abortController?.signal,
    })

    if (preCompactOutcome.kind === 'block') {
      debugLogger.warn('AUTO_COMPACT_BLOCKED_BY_HOOK', {
        message: preCompactOutcome.message,
      })
      return { messages, wasCompacted: false }
    }

    if (preCompactOutcome.warnings.length > 0) {
      debugLogger.warn('AUTO_COMPACT_PRECOMPACT_HOOK_WARNINGS', {
        warnings: preCompactOutcome.warnings,
      })
    }

    const compactedHistory = await executeAutoCompact(history, toolUseContext, {
      compactInstructions: preCompactOutcome.compactInstructions,
    })
    const compactedMessages = pendingUserMessage
      ? [...compactedHistory, pendingUserMessage]
      : compactedHistory

    // Replace the visible transcript in interactive mode so the user sees the
    // new compressed context (and we keep the pending prompt intact).
    getMessagesSetter()?.(compactedMessages)

    return {
      messages: compactedMessages,
      wasCompacted: true,
    }
  } catch (error) {
    // Graceful degradation: if auto-compact fails, continue with original messages
    // This ensures system remains functional even if compression encounters issues
    logError(error)
    debugLogger.warn('AUTO_COMPACT_FAILED', {
      error: error instanceof Error ? error.message : String(error),
    })
    return { messages, wasCompacted: false }
  }
}

/**
 * Executes the conversation compression process using the main model
 *
 * This function generates a comprehensive summary using the main model
 * which is better suited for complex summarization tasks. It also
 * automatically recovers important files to maintain development context.
 */
async function executeAutoCompact(
  messages: Message[],
  toolUseContext: any,
  options?: { compactInstructions?: string },
): Promise<Message[]> {
  const activeModelPointer = getActiveConversationModelPointer(toolUseContext)
  const taskSnapshot = formatCompactionTaskListSnapshot()
  const skillSnapshot = formatCompactionSkillCommandSnapshot(messages)
  const mcpSnapshot = formatCompactionMcpSnapshot({
    messages,
    mcpClients: toolUseContext?.options?.mcpClients,
  })
  const conversationKey = getPlanConversationKey(toolUseContext)
  const planFile = readPlanFile(undefined, conversationKey)
  const planContent = planFile.exists ? planFile.content.trim() : ''
  const planSnapshot =
    planContent.length > 0
      ? `${planFile.planFilePath}\n\n${planContent.length > 8_000 ? `${planContent.slice(0, 8_000)}\n\n… (truncated)` : planContent}`
      : 'No plan file content.'
  const customCompactInstructions = options?.compactInstructions?.trim() ?? ''
  const summaryRequest = createUserMessage(
    `${COMPRESSION_PROMPT_BASE}\n\n` +
      `## Task List Snapshot\n${taskSnapshot}\n\n` +
      `## Skill & Command Snapshot\n${skillSnapshot}\n\n` +
      `## MCP Snapshot\n${mcpSnapshot}\n\n` +
      `## Plan Snapshot\n${planSnapshot}\n\n` +
      (customCompactInstructions
        ? `## Custom Compaction Instructions\n${customCompactInstructions}\n\n`
        : '') +
      `## Active Conversation Model\n${activeModelPointer}\n`,
  )

  const tokenCount = estimateTokens(messages)
  const modelManager = getModelManager()
  const compactResolution = modelManager.resolveModelWithInfo('compact')
  const mainResolution = modelManager.resolveModelWithInfo('main')

  let compressionModelPointer: 'compact' | 'main' = 'compact'
  let compressionNotice: string | null = null

  if (!compactResolution.success || !compactResolution.profile) {
    compressionModelPointer = 'main'
    compressionNotice =
      compactResolution.error ||
      "Compression model pointer 'compact' is not configured."
  } else {
    const compactBudget = Math.floor(
      compactResolution.profile.contextLength * 0.9,
    )
    if (compactBudget > 0 && tokenCount > compactBudget) {
      compressionModelPointer = 'main'
      compressionNotice = `Compression model '${compactResolution.profile.name}' does not fit current context (~${Math.round(tokenCount / 1000)}k tokens).`
    }
  }

  if (
    compressionModelPointer === 'main' &&
    (!mainResolution.success || !mainResolution.profile)
  ) {
    throw new Error(
      mainResolution.error ||
        "Compression fallback failed: model pointer 'main' is not configured.",
    )
  }

  const summaryResponse = await queryLLM(
    normalizeMessagesForAPI([...messages, summaryRequest]),
    [
      'You are a helpful AI assistant tasked with creating comprehensive conversation summaries that preserve all essential context for continuing development work.',
    ],
    0,
    [],
    toolUseContext.abortController.signal,
    {
      safeMode: false,
      model: compressionModelPointer,
      prependCLISysprompt: true,
    },
  )

  const content = summaryResponse.message.content
  const summary =
    typeof content === 'string'
      ? content
      : content.length > 0 && content[0]?.type === 'text'
        ? content[0].text
        : null

  if (!summary) {
    throw new Error(
      'Failed to generate conversation summary - response did not contain valid text content',
    )
  }

  summaryResponse.message.usage = {
    input_tokens: 0,
    output_tokens: summaryResponse.message.usage.output_tokens,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  }

  // Automatic file recovery: preserve recently accessed development files
  // This maintains coding context even after conversation compression
  const recoveredFiles = await selectAndReadFiles()

  const compactedMessages = [
    createUserMessage(
      compressionNotice
        ? `Context automatically compressed due to token limit. ${compressionNotice} Using '${compressionModelPointer}' for compression.`
        : `Context automatically compressed due to token limit. Using '${compressionModelPointer}' for compression.`,
    ),
    summaryResponse,
  ]

  // Append recovered files to maintain development workflow continuity
  // Files are prioritized by recency and importance, with strict token limits
  if (recoveredFiles.length > 0) {
    for (const file of recoveredFiles) {
      const contentWithLines = addLineNumbers({
        content: file.content,
        startLine: 1,
      })
      const recoveryMessage = createUserMessage(
        `**Recovered File: ${file.path}**\n\n\`\`\`\n${contentWithLines}\n\`\`\`\n\n` +
          `*Automatically recovered (${file.tokens} tokens)${file.truncated ? ' [truncated]' : ''}*`,
      )
      compactedMessages.push(recoveryMessage)
    }
  }

  // Persist the compaction boundary (best-effort) so resume screens can show a stable summary
  // and long sessions don't require loading the entire pre-compaction transcript.
  if (
    process.env.NODE_ENV !== 'test' &&
    toolUseContext?.options?.persistSession !== false
  ) {
    try {
      const cwd = getOriginalCwd()
      for (const msg of compactedMessages) {
        appendSessionJsonlFromMessage({ cwd, message: msg, toolUseContext })
      }
      appendSessionSummaryRecord({
        cwd,
        summary,
        leafUuid: summaryResponse.uuid,
      })
    } catch {
      // best-effort only
    }
  }

  // State cleanup to ensure fresh context after compression
  // Mirrors the cleanup sequence from manual /compact command
  getContext.cache.clear?.()
  getCodeStyle.cache.clear?.()
  resetFileFreshnessSession()

  return compactedMessages
}
