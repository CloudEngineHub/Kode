import type { Command } from '../types'
import { getContext } from '#core/context'
import { getMessagesGetter, getMessagesSetter } from '#core/messages'
import { API_ERROR_MESSAGE_PREFIX } from '#core/ai/constants'
import { queryLLM } from '#core/ai/llmLazy'
import { getGlobalConfig } from '#core/utils/config'
import {
  createUserMessage,
  normalizeMessagesForAPI,
} from '#core/utils/messages'
import { getCodeStyle } from '#core/utils/style'
import { clearTerminal } from '#cli-utils/terminal'
import { resetReminderSession } from '#core/services/systemReminder'
import { resetFileFreshnessSession } from '#core/services/fileFreshness'
import { runPreCompactHooks } from '#core/utils/kodeHooks'
import { estimateTokens } from '#core/utils/tokens'
import { getModelManager } from '#core/utils/model'
import { getEffectiveConversationContextLimit } from '#core/utils/autoCompactThreshold'
import {
  formatCompactionMcpSnapshot,
  formatCompactionSkillCommandSnapshot,
  formatCompactionTaskListSnapshot,
} from '#core/utils/compactionSnapshots'
import {
  appendSessionJsonlFromMessage,
  appendSessionSummaryRecord,
} from '#protocol/utils/kodeAgentSessionLog'
import { getCwd, getOriginalCwd } from '#core/utils/state'

const COMPRESSION_PROMPT = `Please provide a comprehensive summary of our conversation structured as follows:

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

const compact = {
  type: 'local',
  name: 'compact',
  description: 'Clear conversation history but keep a summary in context',
  isEnabled: true,
  isHidden: false,
  async call(
    _,
    {
      options: { tools },
      abortController,
      setForkConvoWithMessagesOnTheNextRender,
    },
  ) {
    const messages = getMessagesGetter()()
    const modelManager = getModelManager()
    const mainResolution = modelManager.resolveModelWithInfo('main')
    const mainContextLimit =
      mainResolution.success && mainResolution.profile?.contextLength
        ? mainResolution.profile.contextLength
        : undefined
    const effectiveMainContextLimit =
      typeof mainContextLimit === 'number'
        ? getEffectiveConversationContextLimit(mainContextLimit)
        : undefined
    const activeModelLabel = (() => {
      if (!mainResolution.success || !mainResolution.profile) return 'main'
      const profile = mainResolution.profile
      const size =
        typeof profile.contextLength === 'number'
          ? `${Math.round(profile.contextLength / 1000)}k`
          : '?'
      return `main (${profile.name}, ${size})`
    })()

    const preCompactOutcome = await runPreCompactHooks({
      trigger: 'manual',
      tokenCountBefore: estimateTokens(messages),
      contextLimit: effectiveMainContextLimit,
      model: 'main',
      cwd: getCwd(),
      signal: abortController.signal,
    })

    if (preCompactOutcome.kind === 'block') {
      return `Compaction blocked by hook:\n${preCompactOutcome.message}`
    }

    const taskSnapshot = formatCompactionTaskListSnapshot()
    const skillSnapshot = formatCompactionSkillCommandSnapshot(messages)
    const mcpSnapshot = formatCompactionMcpSnapshot({
      messages,
      mcpClients: null,
    })
    const customCompactInstructions =
      preCompactOutcome.compactInstructions.trim()
    const summaryRequest = createUserMessage(
      `${COMPRESSION_PROMPT}\n\n## Task List Snapshot\n${taskSnapshot}\n` +
        `\n## Skill & Command Snapshot\n${skillSnapshot}\n` +
        `\n## MCP Snapshot\n${mcpSnapshot}\n` +
        (customCompactInstructions
          ? `\n## Custom Compaction Instructions\n${customCompactInstructions}\n`
          : '') +
        `\n## Active Conversation Model\n${activeModelLabel}\n`,
    )
    const compactPointer = getGlobalConfig().modelPointers?.compact

    const summaryResponse = await queryLLM(
      normalizeMessagesForAPI([...messages, summaryRequest]),
      [
        'You are a helpful AI assistant tasked with creating comprehensive conversation summaries that preserve all essential context for continuing development work.',
      ],
      0,
      tools,
      abortController.signal,
      {
        safeMode: false,
        model: compactPointer ? 'compact' : 'main', // 使用模型指针，让queryLLM统一解析
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
        `Failed to generate conversation summary - response did not contain valid text content - ${summaryResponse}`,
      )
    } else if (summary.startsWith(API_ERROR_MESSAGE_PREFIX)) {
      throw new Error(summary)
    }

    summaryResponse.message.usage = {
      input_tokens: 0,
      output_tokens: summaryResponse.message.usage.output_tokens,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    }

    const compactedIntro = createUserMessage(
      `Context has been compressed using structured 8-section algorithm. All essential information has been preserved for seamless continuation.`,
    )

    if (process.env.NODE_ENV !== 'test') {
      try {
        const cwd = getOriginalCwd()
        appendSessionJsonlFromMessage({
          cwd,
          message: compactedIntro,
          toolUseContext: { agentId: 'main' },
        })
        appendSessionJsonlFromMessage({
          cwd,
          message: summaryResponse,
          toolUseContext: { agentId: 'main' },
        })
        appendSessionSummaryRecord({
          cwd,
          summary,
          leafUuid: summaryResponse.uuid,
        })
      } catch {
        // best-effort only
      }
    }

    await clearTerminal()
    getMessagesSetter()([])
    setForkConvoWithMessagesOnTheNextRender([compactedIntro, summaryResponse], {
      clearViewport: false,
      resetInput: true,
    })
    getContext.cache.clear?.()
    getCodeStyle.cache.clear?.()
    resetFileFreshnessSession()

    // Reset reminder and file freshness sessions to clean up state
    resetReminderSession()

    return '' // not used (typesafety only)
  },
  userFacingName() {
    return 'compact'
  },
} satisfies Command

export default compact
