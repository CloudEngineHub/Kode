import { z } from 'zod'

import type { SdkMessage } from './streamJson'

export type PermissionRequestEvent = {
  type: 'permission_request'
  request_id: string
  tool_name: string
  tool_description: string
  input: Record<string, unknown>
}

export type HistoryBeginEvent = {
  type: 'history_begin'
  sessionId: string
}

export type HistoryEndEvent = {
  type: 'history_end'
  sessionId: string
}

export type AgentEvent =
  | SdkMessage
  | PermissionRequestEvent
  | HistoryBeginEvent
  | HistoryEndEvent

const ContentBlockSchema = z
  .object({
    type: z.string(),
  })
  .passthrough()

const SystemEventSchema = z
  .object({
    type: z.literal('system'),
    subtype: z.string(),
    session_id: z.string().optional(),
    model: z.string().optional(),
    cwd: z.string().optional(),
    tools: z.array(z.string()).optional(),
    slash_commands: z.array(z.string()).optional(),
    status: z.string().optional(),
    uuid: z.string().optional(),
  })
  .strict()

const UserEventSchema = z
  .object({
    type: z.literal('user'),
    session_id: z.string().optional(),
    uuid: z.string().optional(),
    parent_tool_use_id: z.string().nullable().optional(),
    message: z
      .object({
        role: z.literal('user'),
        content: z.union([z.string(), z.array(ContentBlockSchema)]),
      })
      .strict(),
  })
  .strict()

const AssistantEventSchema = z
  .object({
    type: z.literal('assistant'),
    session_id: z.string().optional(),
    uuid: z.string().optional(),
    parent_tool_use_id: z.string().nullable().optional(),
    message: z
      .object({
        role: z.literal('assistant'),
        content: z.array(ContentBlockSchema),
      })
      .strict(),
  })
  .strict()

const ResultEventSchema = z
  .object({
    type: z.literal('result'),
    subtype: z.enum([
      'success',
      'error_during_execution',
      'error_max_turns',
      'error_max_budget_usd',
    ]),
    result: z.string().optional(),
    structured_output: z.record(z.unknown()).optional(),
    num_turns: z.number(),
    usage: z.unknown().optional(),
    total_cost_usd: z.number(),
    duration_ms: z.number(),
    duration_api_ms: z.number(),
    is_error: z.boolean(),
    session_id: z.string(),
  })
  .strict()

const LogEventSchema = z
  .object({
    type: z.literal('log'),
    log: z
      .object({
        level: z.enum(['debug', 'info', 'warn', 'error']),
        message: z.string(),
      })
      .strict(),
  })
  .strict()

const PermissionRequestEventSchema = z
  .object({
    type: z.literal('permission_request'),
    request_id: z.string(),
    tool_name: z.string(),
    tool_description: z.string(),
    input: z.record(z.unknown()),
  })
  .strict()

const HistoryBeginEventSchema = z
  .object({
    type: z.literal('history_begin'),
    sessionId: z.string(),
  })
  .strict()

const HistoryEndEventSchema = z
  .object({
    type: z.literal('history_end'),
    sessionId: z.string(),
  })
  .strict()

export const AgentEventSchema = z.discriminatedUnion('type', [
  SystemEventSchema,
  UserEventSchema,
  AssistantEventSchema,
  ResultEventSchema,
  LogEventSchema,
  PermissionRequestEventSchema,
  HistoryBeginEventSchema,
  HistoryEndEventSchema,
]) as unknown as z.ZodType<AgentEvent>
