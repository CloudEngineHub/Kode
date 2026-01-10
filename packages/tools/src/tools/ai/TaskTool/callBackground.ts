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
): AsyncGenerator<{
  type: 'result'
  data: Output
  resultForAssistant: string
}> {
  const bgAbortController = new AbortController()

  const taskRecord: BackgroundAgentTaskRuntime = {
    type: 'async_agent',
    agentId: prepared.agentId,
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

      taskRecord.status = 'completed'
      taskRecord.completedAt = Date.now()
      taskRecord.resultText = content.map(b => b.text).join('\n')
      taskRecord.messages = [...bgTranscriptMessages]
      upsertBackgroundAgentTask(taskRecord)
      saveAgentTranscript(prepared.agentId, bgTranscriptMessages)
    } catch (e) {
      taskRecord.status = 'failed'
      taskRecord.completedAt = Date.now()
      taskRecord.error = e instanceof Error ? e.message : String(e)
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
