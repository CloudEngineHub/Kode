import { last } from 'lodash-es'

import type { TextBlock } from '@anthropic-ai/sdk/resources/index.mjs'

import type { Message as ConversationMessage } from '#core/query'
import {
  getLastAssistantMessageId,
  createAssistantMessage,
} from '#core/utils/messages'
import {
  upsertBackgroundAgentTask,
  type BackgroundAgentTaskRuntime,
} from '#core/utils/backgroundTasks'
import { saveAgentTranscript } from '#core/utils/agentTranscripts'
import { getKodeAgentSessionId } from '#protocol/utils/kodeAgentSessionId'
import { hasPermissionsToUseTool } from '#core/permissions'
import {
  appendBackgroundTaskOutput,
  getBackgroundTaskOutputFilePath,
  touchBackgroundTaskOutputFile,
} from '#core/tasks/backgroundRegistry'
import {
  createDurableRun,
  finishDurableRun,
  heartbeatDurableRun,
} from '#core/runs'
import { getCwd } from '#core/utils/state'

import type { PreparedTaskToolRun } from './callTypes'
import type { Input, Output } from './schema'
import { asyncLaunchMessage } from './assistantText'

function isTextBlock(block: unknown): block is TextBlock {
  return (
    Boolean(block) &&
    typeof block === 'object' &&
    (block as { type?: unknown }).type === 'text' &&
    typeof (block as { text?: unknown }).text === 'string'
  )
}

export async function* callTaskToolBackground(
  input: Input,
  prepared: PreparedTaskToolRun,
  metadata?: {
    parentAgentId?: string
    parentToolUseId?: string
    subagentType?: string
    model?: string
  },
): AsyncGenerator<{
  type: 'result'
  data: Output
  resultForAssistant: string
}> {
  const bgAbortController = new AbortController()
  touchBackgroundTaskOutputFile(prepared.agentId)
  const durableRunEnabled = process.env.NODE_ENV !== 'test'
  if (durableRunEnabled) {
    try {
      createDurableRun({
        id: prepared.agentId,
        kind: 'agent',
        cwd: getCwd(),
        sessionId: getKodeAgentSessionId(),
        command: input.description,
        outputFile: getBackgroundTaskOutputFilePath(prepared.agentId),
      })
    } catch {
      // The in-memory task must remain usable if durable journaling is blocked.
    }
  }

  const heartbeatDurableTask = () => {
    if (!durableRunEnabled) return
    try {
      heartbeatDurableRun({ id: prepared.agentId })
    } catch {
      // Best-effort only.
    }
  }
  const finishDurableTask = (
    status: 'completed' | 'failed' | 'cancelled',
    error?: string,
  ) => {
    if (!durableRunEnabled) return
    try {
      finishDurableRun({
        id: prepared.agentId,
        status,
        ...(error ? { error } : {}),
      })
    } catch {
      // Best-effort only.
    }
  }

  const taskRecord: BackgroundAgentTaskRuntime = {
    type: 'async_agent',
    agentId: prepared.agentId,
    parentAgentId: metadata?.parentAgentId,
    parentToolUseId: metadata?.parentToolUseId,
    subagentType: metadata?.subagentType,
    model: metadata?.model,
    description: input.description,
    prompt: prepared.effectivePrompt,
    status: 'running',
    cwd: getCwd(),
    sessionId: getKodeAgentSessionId(),
    startedAt: Date.now(),
    messages: [...prepared.transcriptMessages],
    abortController: bgAbortController,
    done: Promise.resolve(),
  }

  taskRecord.done = (async () => {
    try {
      const bgMessages: ConversationMessage[] = [...prepared.messagesForQuery]
      const bgTranscriptMessages: ConversationMessage[] = [
        ...prepared.transcriptMessages,
      ]

      for await (const msg of prepared.queryFn(
        bgMessages,
        prepared.systemPrompt,
        prepared.context,
        hasPermissionsToUseTool,
        {
          abortController: bgAbortController,
          options: prepared.queryOptions,
          messageId: getLastAssistantMessageId(bgMessages),
          agentId: prepared.agentId,
          readFileTimestamps: prepared.readFileTimestamps,
          setToolJSX: () => {},
        },
      )) {
        bgMessages.push(msg)
        bgTranscriptMessages.push(msg)

        if (msg.type === 'assistant') {
          const content = msg.message.content
          const text =
            typeof content === 'string'
              ? content
              : Array.isArray(content)
                ? content
                    .filter(isTextBlock)
                    .map(b => b.text)
                    .join('\n')
                : ''
          if (text) {
            appendBackgroundTaskOutput(prepared.agentId, text.trimEnd() + '\n')
          }
        }

        taskRecord.messages = [...bgTranscriptMessages]
        upsertBackgroundAgentTask(taskRecord)
        heartbeatDurableTask()
      }

      const lastAssistant = last(
        bgTranscriptMessages.filter(m => m.type === 'assistant'),
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
        appendBackgroundTaskOutput(
          prepared.agentId,
          '\n[task killed]\n'.replace(/^\n+/, ''),
        )
      }
      taskRecord.messages = [...bgTranscriptMessages]
      upsertBackgroundAgentTask(taskRecord)
      saveAgentTranscript(prepared.agentId, bgTranscriptMessages)
      finishDurableTask(
        taskRecord.status === 'killed' ? 'cancelled' : 'completed',
      )
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)

      if (taskRecord.status === 'killed' || bgAbortController.signal.aborted) {
        taskRecord.status = 'killed'
        taskRecord.completedAt = taskRecord.completedAt ?? Date.now()
        taskRecord.error = taskRecord.error ?? (message || 'Killed by user')
        appendBackgroundTaskOutput(
          prepared.agentId,
          '\n[task killed]\n'.replace(/^\n+/, ''),
        )
      } else {
        taskRecord.status = 'failed'
        taskRecord.completedAt = Date.now()
        taskRecord.error = message
        appendBackgroundTaskOutput(
          prepared.agentId,
          `\n[error] ${message}\n`.replace(/^\n+/, ''),
        )
      }
      upsertBackgroundAgentTask(taskRecord)
      finishDurableTask(
        taskRecord.status === 'killed' ? 'cancelled' : 'failed',
        message,
      )
    }
  })()

  upsertBackgroundAgentTask(taskRecord)

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
}
