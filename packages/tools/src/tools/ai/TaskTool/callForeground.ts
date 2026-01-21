import { last, memoize } from 'lodash-es'

import type { TextBlock } from '@anthropic-ai/sdk/resources/index.mjs'

import React from 'react'

import type { Message as ConversationMessage } from '#core/query'
import { hasPermissionsToUseTool } from '#core/permissions'
import type { SetToolJSXFn } from '#core/tooling/Tool'
import { saveAgentTranscript } from '#core/utils/agentTranscripts'
import {
  upsertBackgroundAgentTask,
  type BackgroundAgentTaskRuntime,
} from '#core/utils/backgroundTasks'
import { countTokens } from '#core/utils/tokens'
import {
  getMessagesPath,
  getNextAvailableLogSidechainNumber,
  overwriteLog,
} from '#core/utils/log'
import {
  createAssistantMessage,
  getLastAssistantMessageId,
} from '#core/utils/messages'
import { appendTaskOutput, touchTaskOutputFile } from '#runtime/taskOutputStore'
import { BashToolRunInBackgroundOverlay } from '#tools/tools/system/BashTool/BashToolRunInBackgroundOverlay'

import { asyncLaunchMessage } from './assistantText'
import type { PreparedTaskToolRun } from './callTypes'
import type { Input, Output, TaskUsage } from './schema'

function isTextBlock(block: unknown): block is TextBlock {
  return (
    Boolean(block) &&
    typeof block === 'object' &&
    (block as { type?: unknown }).type === 'text' &&
    typeof (block as { text?: unknown }).text === 'string'
  )
}

function getAssistantText(message: ConversationMessage): string {
  if (message.type !== 'assistant') return ''
  const content = message.message.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter(isTextBlock)
    .map(b => b.text)
    .join('\n')
}

type ToolUseLikeBlock = {
  type: 'tool_use' | 'server_tool_use' | 'mcp_tool_use'
  name: string
  input?: unknown
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
  const name = (block as { name?: unknown }).name
  return typeof name === 'string'
}

function isIteratorYieldResult<T, TReturn>(
  result: IteratorResult<T, TReturn>,
): result is IteratorYieldResult<T> {
  return result.done !== true
}

function truncate(text: string, maxLen: number): string {
  const normalized = text.replace(/\\s+/g, ' ').trim()
  if (normalized.length <= maxLen) return normalized
  return `${normalized.slice(0, maxLen - 1)}…`
}

function summarizeToolUse(name: string, rawInput: unknown): string {
  const input =
    rawInput && typeof rawInput === 'object'
      ? (rawInput as Record<string, unknown>)
      : {}
  switch (name) {
    case 'Read': {
      const filePath =
        (typeof input.file_path === 'string' && input.file_path) ||
        (typeof input.path === 'string' && input.path) ||
        ''
      return filePath ? `Read ${filePath}` : 'Read'
    }
    case 'Write': {
      const filePath =
        (typeof input.file_path === 'string' && input.file_path) ||
        (typeof input.path === 'string' && input.path) ||
        ''
      return filePath ? `Write ${filePath}` : 'Write'
    }
    case 'Edit':
    case 'MultiEdit': {
      const filePath =
        (typeof input.file_path === 'string' && input.file_path) ||
        (typeof input.path === 'string' && input.path) ||
        ''
      return filePath ? `${name} ${filePath}` : name
    }
    case 'Grep': {
      const pattern = typeof input.pattern === 'string' ? input.pattern : ''
      return pattern ? `Grep ${truncate(pattern, 80)}` : 'Grep'
    }
    case 'Glob': {
      const pattern =
        (typeof input.pattern === 'string' && input.pattern) ||
        (typeof input.glob === 'string' && input.glob) ||
        ''
      return pattern ? `Glob ${truncate(pattern, 80)}` : 'Glob'
    }
    case 'Bash': {
      const command = typeof input.command === 'string' ? input.command : ''
      return command ? `Bash ${truncate(command, 80)}` : 'Bash'
    }
    case 'WebFetch':
    case 'WebSearch': {
      const url = typeof input.url === 'string' ? input.url : ''
      const query = typeof input.query === 'string' ? input.query : ''
      if (url) return `${name} ${truncate(url, 100)}`
      if (query) return `${name} ${truncate(query, 100)}`
      return name
    }
    default:
      return name
  }
}

function normalizeUsage(rawUsage: unknown): TaskUsage {
  const usage =
    rawUsage && typeof rawUsage === 'object'
      ? (rawUsage as Record<string, unknown>)
      : {}

  const serverToolUse =
    usage.server_tool_use && typeof usage.server_tool_use === 'object'
      ? (usage.server_tool_use as Record<string, unknown>)
      : null

  const cacheCreation =
    usage.cache_creation && typeof usage.cache_creation === 'object'
      ? (usage.cache_creation as Record<string, unknown>)
      : null

  const serviceTier = usage.service_tier
  const serviceTierNormalized =
    serviceTier === 'standard' ||
    serviceTier === 'priority' ||
    serviceTier === 'batch'
      ? serviceTier
      : null

  return {
    input_tokens:
      typeof usage.input_tokens === 'number' ? usage.input_tokens : 0,
    output_tokens:
      typeof usage.output_tokens === 'number' ? usage.output_tokens : 0,
    cache_creation_input_tokens:
      typeof usage.cache_creation_input_tokens === 'number'
        ? usage.cache_creation_input_tokens
        : null,
    cache_read_input_tokens:
      typeof usage.cache_read_input_tokens === 'number'
        ? usage.cache_read_input_tokens
        : null,
    server_tool_use: serverToolUse
      ? {
          web_search_requests:
            typeof serverToolUse.web_search_requests === 'number'
              ? serverToolUse.web_search_requests
              : 0,
          web_fetch_requests:
            typeof serverToolUse.web_fetch_requests === 'number'
              ? serverToolUse.web_fetch_requests
              : 0,
        }
      : null,
    service_tier: serviceTierNormalized,
    cache_creation: cacheCreation
      ? {
          ephemeral_1h_input_tokens:
            typeof cacheCreation.ephemeral_1h_input_tokens === 'number'
              ? cacheCreation.ephemeral_1h_input_tokens
              : 0,
          ephemeral_5m_input_tokens:
            typeof cacheCreation.ephemeral_5m_input_tokens === 'number'
              ? cacheCreation.ephemeral_5m_input_tokens
              : 0,
        }
      : null,
  }
}

export async function* callTaskToolForeground(
  input: Input,
  prepared: PreparedTaskToolRun,
  options?: {
    setToolJSX?: SetToolJSXFn
    backgroundMetadata?: {
      parentAgentId?: string
      parentToolUseId?: string
      subagentType?: string
      model?: string
    }
  },
): AsyncGenerator<
  | { type: 'progress'; content: ConversationMessage }
  | {
      type: 'result'
      data: Output
      resultForAssistant: string | TextBlock[]
    }
> {
  const getSidechainNumber = memoize(() =>
    getNextAvailableLogSidechainNumber(
      prepared.messageLogName,
      prepared.forkNumber,
    ),
  )

  const PROGRESS_THROTTLE_MS = 200
  const PROGRESS_INITIAL_DELAY_MS = 1800
  const MAX_RECENT_ACTIONS = 6
  let lastProgressEmitAt = 0
  let lastEmittedToolUseCount = 0
  const recentActions: string[] = []
  const setToolJSX = options?.setToolJSX

  let backgroundRequested = false
  let resolveBackgroundRequested: (() => void) | null = null
  const backgroundRequestedPromise = new Promise<void>(resolve => {
    resolveBackgroundRequested = resolve
  })

  const requestBackground = () => {
    if (backgroundRequested) return
    backgroundRequested = true
    resolveBackgroundRequested?.()
  }

  let backgrounded = false
  const runAbortController = new AbortController()
  const onParentAbort = () => {
    if (backgrounded) return
    runAbortController.abort()
  }
  prepared.abortController.signal.addEventListener('abort', onParentAbort)

  let overlayTimeout: ReturnType<typeof setTimeout> | null = null
  if (setToolJSX) {
    overlayTimeout = setTimeout(() => {
      if (backgrounded) return
      if (runAbortController.signal.aborted) return
      setToolJSX({
        jsx: React.createElement(BashToolRunInBackgroundOverlay, {
          onBackground: requestBackground,
        }),
        shouldHidePromptInput: false,
      })
    }, PROGRESS_INITIAL_DELAY_MS)
    overlayTimeout.unref?.()
  }

  touchTaskOutputFile(prepared.agentId)

  const addRecentAction = (action: string) => {
    const trimmed = action.trim()
    if (!trimmed) return
    recentActions.push(trimmed)
    if (recentActions.length > MAX_RECENT_ACTIONS) {
      recentActions.splice(0, recentActions.length - MAX_RECENT_ACTIONS)
    }
  }

  const renderProgressText = (toolUseCount: number): string => {
    const header = `${input.description || 'Task'}… (${toolUseCount} tool${toolUseCount === 1 ? '' : 's'})`
    if (recentActions.length === 0) return header
    const lines = recentActions.map(a => `- ${a}`)
    return [header, ...lines].join('\\n')
  }

  yield {
    type: 'progress',
    content: createAssistantMessage(
      `<tool-progress>${renderProgressText(0)}</tool-progress>`,
    ),
  }
  lastProgressEmitAt = Date.now()

  let toolUseCount = 0
  const recordMessage = (message: ConversationMessage, persistLog: boolean) => {
    prepared.messagesForQuery.push(message)
    prepared.transcriptMessages.push(message)

    if (persistLog) {
      overwriteLog(
        getMessagesPath(
          prepared.messageLogName,
          prepared.forkNumber,
          getSidechainNumber(),
        ),
        prepared.transcriptMessages.filter(m => m.type !== 'progress'),
        {
          conversationKey: `${prepared.messageLogName}:${prepared.forkNumber}`,
        },
      )
    }

    if (message.type === 'assistant') {
      const assistantText = getAssistantText(message)
      if (assistantText) {
        appendTaskOutput(prepared.agentId, assistantText.trimEnd() + '\n')
      }

      for (const block of message.message.content) {
        if (!isToolUseLikeBlock(block)) continue
        toolUseCount += 1
        addRecentAction(summarizeToolUse(block.name, block.input))
      }
    }
  }

  const queryIterator = prepared
    .queryFn(
      prepared.messagesForQuery,
      prepared.systemPrompt,
      prepared.context,
      hasPermissionsToUseTool,
      {
        abortController: runAbortController,
        options: prepared.queryOptions,
        messageId: getLastAssistantMessageId(prepared.messagesForQuery),
        agentId: prepared.agentId,
        readFileTimestamps: prepared.readFileTimestamps,
        setToolJSX: () => {},
      },
    )
    [Symbol.asyncIterator]()

  let nextPromise = queryIterator.next()

  const startBackgroundTask = (
    firstNextPromise: Promise<IteratorResult<ConversationMessage, void>>,
  ): BackgroundAgentTaskRuntime => {
    const taskRecord: BackgroundAgentTaskRuntime = {
      type: 'async_agent',
      agentId: prepared.agentId,
      parentAgentId: options?.backgroundMetadata?.parentAgentId,
      parentToolUseId: options?.backgroundMetadata?.parentToolUseId,
      subagentType: options?.backgroundMetadata?.subagentType,
      model: options?.backgroundMetadata?.model,
      description: input.description,
      prompt: prepared.effectivePrompt,
      status: 'running',
      startedAt: prepared.startTime,
      messages: [...prepared.transcriptMessages],
      abortController: runAbortController,
      done: Promise.resolve(),
    }

    taskRecord.done = (async () => {
      try {
        let iterResult = await firstNextPromise
        while (isIteratorYieldResult(iterResult)) {
          recordMessage(iterResult.value, false)
          taskRecord.messages = [...prepared.transcriptMessages]
          upsertBackgroundAgentTask(taskRecord)
          iterResult = await queryIterator.next()
        }

        const lastAssistant = last(
          prepared.transcriptMessages.filter(m => m.type === 'assistant'),
        )
        const content =
          lastAssistant?.type === 'assistant'
            ? lastAssistant.message.content.filter(isTextBlock)
            : []
        const resultText = content.map(b => b.text).join('\n')

        if (taskRecord.status !== 'killed') {
          taskRecord.status = 'completed'
          taskRecord.completedAt = Date.now()
          taskRecord.resultText = resultText
        } else {
          taskRecord.completedAt = taskRecord.completedAt ?? Date.now()
          if (resultText) taskRecord.resultText = resultText
          appendTaskOutput(
            prepared.agentId,
            '\n[task killed]\n'.replace(/^\n+/, ''),
          )
        }

        taskRecord.messages = [...prepared.transcriptMessages]
        upsertBackgroundAgentTask(taskRecord)
        saveAgentTranscript(prepared.agentId, prepared.transcriptMessages)
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)

        if (
          taskRecord.status === 'killed' ||
          runAbortController.signal.aborted
        ) {
          taskRecord.status = 'killed'
          taskRecord.completedAt = taskRecord.completedAt ?? Date.now()
          taskRecord.error = taskRecord.error ?? (message || 'Killed by user')
          appendTaskOutput(
            prepared.agentId,
            '\n[task killed]\n'.replace(/^\n+/, ''),
          )
        } else {
          taskRecord.status = 'failed'
          taskRecord.completedAt = Date.now()
          taskRecord.error = message
          appendTaskOutput(
            prepared.agentId,
            `\n[error] ${message}\n`.replace(/^\n+/, ''),
          )
        }

        taskRecord.messages = [...prepared.transcriptMessages]
        upsertBackgroundAgentTask(taskRecord)
      }
    })()

    upsertBackgroundAgentTask(taskRecord)
    return taskRecord
  }

  try {
    while (true) {
      const raced = await Promise.race([
        nextPromise.then(res => ({ kind: 'next' as const, res })),
        backgroundRequestedPromise.then(() => ({
          kind: 'background' as const,
        })),
      ])

      if (raced.kind === 'background') {
        backgrounded = true
        prepared.abortController.signal.removeEventListener(
          'abort',
          onParentAbort,
        )
        if (overlayTimeout) clearTimeout(overlayTimeout)
        overlayTimeout = null

        startBackgroundTask(nextPromise)
        const output: Output = {
          status: 'async_launched',
          agentId: prepared.agentId,
          description: input.description,
          prompt: prepared.effectivePrompt,
        }

        yield {
          type: 'result',
          data: output,
          resultForAssistant: asyncLaunchMessage(prepared.agentId),
        }
        return
      }

      const iterResult = raced.res
      if (!isIteratorYieldResult(iterResult)) break
      recordMessage(iterResult.value, true)

      const now = Date.now()
      const hasNewToolUses = toolUseCount > lastEmittedToolUseCount
      const shouldEmit =
        hasNewToolUses &&
        (lastEmittedToolUseCount === 0 ||
          now - lastProgressEmitAt >= PROGRESS_THROTTLE_MS)
      if (shouldEmit) {
        yield {
          type: 'progress',
          content: createAssistantMessage(
            `<tool-progress>${renderProgressText(toolUseCount)}</tool-progress>`,
          ),
        }
        lastEmittedToolUseCount = toolUseCount
        lastProgressEmitAt = now
      }

      nextPromise = queryIterator.next()
    }
  } finally {
    if (overlayTimeout) clearTimeout(overlayTimeout)
    prepared.abortController.signal.removeEventListener('abort', onParentAbort)
    setToolJSX?.(null)
  }

  const lastAssistant = last(
    prepared.transcriptMessages.filter(m => m.type === 'assistant'),
  )
  if (!lastAssistant || lastAssistant.type !== 'assistant') {
    throw new Error('No assistant messages found')
  }

  const content = lastAssistant.message.content.filter(isTextBlock)

  const totalDurationMs = Date.now() - prepared.startTime
  const totalTokens = countTokens(prepared.transcriptMessages)
  const usage = normalizeUsage(lastAssistant.message.usage)

  const output: Output = {
    status: 'completed',
    agentId: prepared.agentId,
    prompt: prepared.effectivePrompt,
    content,
    totalToolUseCount: toolUseCount,
    totalDurationMs,
    totalTokens,
    usage,
  }
  const agentIdBlock: TextBlock = {
    type: 'text',
    text: `agentId: ${prepared.agentId} (for resuming to continue this agent's work if needed)`,
    citations: [],
  }

  yield {
    type: 'result',
    data: output,
    resultForAssistant: [...content, agentIdBlock],
  }
}
