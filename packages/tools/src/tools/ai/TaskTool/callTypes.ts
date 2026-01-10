import type { CanUseToolFn } from '#core/permissions/canUseTool'
import type {
  AssistantMessage,
  BinaryFeedbackResult,
  ExtendedToolUseContext,
  Message as ConversationMessage,
} from '#core/query'
import type { PermissionMode } from '#core/types/PermissionMode'
import type { Tool } from '#core/tooling/Tool'

export type QueryFn = (
  messages: ConversationMessage[],
  systemPrompt: string[],
  context: Record<string, string>,
  canUseTool: CanUseToolFn,
  toolUseContext: ExtendedToolUseContext,
  getBinaryFeedbackResponse?: (
    m1: AssistantMessage,
    m2: AssistantMessage,
  ) => Promise<BinaryFeedbackResult>,
) => AsyncGenerator<ConversationMessage, void>

export type TaskToolQueryOptions = ExtendedToolUseContext['options'] & {
  permissionMode: PermissionMode
  tools: Tool[]
}

export type PreparedTaskToolRun = {
  queryFn: QueryFn
  agentId: string
  effectivePrompt: string
  systemPrompt: string[]
  context: Record<string, string>
  messagesForQuery: ConversationMessage[]
  transcriptMessages: ConversationMessage[]
  queryOptions: TaskToolQueryOptions
  messageLogName: string
  forkNumber: number
  abortController: AbortController
  readFileTimestamps: Record<string, number>
  startTime: number
}
