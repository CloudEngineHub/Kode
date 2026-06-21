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
import { hasPermissionsToUseTool } from '#core/permissions'
import { appendTaskOutput, touchTaskOutputFile } from '#runtime/taskOutputStore'

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
  touchTaskOutputFile(prepared.agentId)

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
          if (text) appendTaskOutput(prepared.agentId, text.trimEnd() + '\n')
        }

        taskRecord.messages = [...bgTranscriptMessages]
        upsertBackgroundAgentTask(taskRecord)
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
        appendTaskOutput(
          prepared.agentId,
          '\n[task killed]\n'.replace(/^\n+/, ''),
        )
      }
      taskRecord.messages = [...bgTranscriptMessages]
      upsertBackgroundAgentTask(taskRecord)
      saveAgentTranscript(prepared.agentId, bgTranscriptMessages)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)

      if (taskRecord.status === 'killed' || bgAbortController.signal.aborted) {
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
      upsertBackgroundAgentTask(taskRecord)
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
