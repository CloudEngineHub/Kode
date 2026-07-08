import type { CanUseToolFn } from '#core/permissions/canUseTool'
import { getOriginalCwd } from '#core/utils/state'
import { appendSessionJsonlFromMessage } from '#protocol/utils/kodeAgentSessionLog'

import type {
  AssistantMessage,
  BinaryFeedbackResult,
  Message,
  ExtendedToolUseContext,
} from './message-pipeline'
import { messagePipeline } from './message-pipeline'

/**
 * Core query orchestrator.
 *
 * Streams `Message` objects (user/assistant/progress) for a single user turn, including tool use.
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
  const shouldPersistSession =
    toolUseContext.options?.persistSession !== false &&
    process.env.NODE_ENV !== 'test'
  const cwd = shouldPersistSession ? getOriginalCwd() : null

  if (shouldPersistSession) {
    const last = messages[messages.length - 1]
    if (last?.type === 'user') {
      appendSessionJsonlFromMessage({
        cwd: cwd ?? getOriginalCwd(),
        message: last,
        toolUseContext,
      })
    }
  }

  for await (const message of messagePipeline(
    messages,
    systemPrompt,
    context,
    canUseTool,
    toolUseContext,
    getBinaryFeedbackResponse,
  )) {
    if (shouldPersistSession) {
      appendSessionJsonlFromMessage({
        cwd: cwd ?? getOriginalCwd(),
        message,
        toolUseContext,
      })
    }
    yield message
  }
}
