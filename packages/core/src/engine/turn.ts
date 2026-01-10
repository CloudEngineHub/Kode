import type { AgentEvent } from '#protocol/agentEvent'
import type {
  AssistantMessage,
  BinaryFeedbackResult,
  Message,
} from '#core/query'
import type { CanUseToolFn } from '#core/permissions/canUseTool'

import { getContext } from '#core/context'
import { query } from './orchestrator'

import { messagesToAgentEvents } from '../query/agentEvents'
import { buildSystemPromptForSession } from './systemPrompt'

export type QueryToolUseContext = Parameters<typeof query>[4]

export async function getSessionContext(): Promise<{ [k: string]: string }> {
  return getContext()
}

export async function* runTurn(args: {
  messages: Message[]
  canUseTool: CanUseToolFn
  toolUseContext: QueryToolUseContext

  disableSlashCommands?: boolean
  systemPromptOverride?: string
  appendSystemPrompt?: string
  jsonSchema?: Record<string, unknown> | null

  systemPrompt?: string[]
  context?: { [k: string]: string }

  getBinaryFeedbackResponse?: (
    m1: AssistantMessage,
    m2: AssistantMessage,
  ) => Promise<BinaryFeedbackResult>
}): AsyncGenerator<Message, void> {
  const [systemPrompt, context] = await Promise.all([
    args.systemPrompt ??
      buildSystemPromptForSession({
        disableSlashCommands: args.disableSlashCommands,
        systemPromptOverride: args.systemPromptOverride,
        appendSystemPrompt: args.appendSystemPrompt,
        jsonSchema: args.jsonSchema,
      }),
    args.context ?? getContext(),
  ])

  yield* query(
    args.messages,
    systemPrompt,
    context,
    args.canUseTool,
    args.toolUseContext,
    args.getBinaryFeedbackResponse,
  )
}

export async function* runTurnEvents(
  args: {
    sessionId: string
  } & Parameters<typeof runTurn>[0],
): AsyncGenerator<AgentEvent, void> {
  yield* messagesToAgentEvents({
    source: runTurn(args),
    sessionId: args.sessionId,
  })
}
