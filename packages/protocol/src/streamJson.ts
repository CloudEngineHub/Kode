// Helpers for Kode Agent stream-json SDK mode.

export type SdkContentBlock = { type: string } & Record<string, unknown>

export type SdkMessage =
  | {
      type: 'system'
      subtype: string
      session_id?: string
      model?: string
      cwd?: string
      tools?: string[]
      slash_commands?: string[]
      status?: string
      uuid?: string
    }
  | {
      type: 'stream_event'
      event: unknown
      session_id: string
      parent_tool_use_id?: string | null
      uuid?: string
    }
  | {
      type: 'user'
      session_id?: string
      uuid?: string
      parent_tool_use_id?: string | null
      message: { role: 'user'; content: string | SdkContentBlock[] }
    }
  | {
      type: 'assistant'
      session_id?: string
      uuid?: string
      parent_tool_use_id?: string | null
      message: { role: 'assistant'; content: SdkContentBlock[] }
    }
  | {
      type: 'result'
      subtype:
        | 'success'
        | 'error_during_execution'
        | 'error_max_turns'
        | 'error_max_budget_usd'
      result?: string
      structured_output?: Record<string, unknown>
      num_turns: number
      usage?: unknown
      total_cost_usd: number
      duration_ms: number
      duration_api_ms: number
      is_error: boolean
      session_id: string
      uuid?: string
    }
  | {
      type: 'log'
      log: { level: 'debug' | 'info' | 'warn' | 'error'; message: string }
    }

export function makeSdkInitMessage(args: {
  sessionId: string
  cwd: string
  model?: string
  tools?: string[]
  slashCommands?: string[]
  uuid?: string
}): SdkMessage {
  return {
    type: 'system',
    subtype: 'init',
    session_id: args.sessionId,
    cwd: args.cwd,
    model: args.model,
    tools: args.tools,
    ...(args.uuid ? { uuid: args.uuid } : {}),
    ...(args.slashCommands ? { slash_commands: args.slashCommands } : {}),
  }
}

export function makeSdkResultMessage(args: {
  sessionId: string
  result?: string
  structuredOutput?: Record<string, unknown>
  numTurns: number
  usage?: any
  totalCostUsd: number
  durationMs: number
  durationApiMs: number
  isError: boolean
  subtype?: Extract<SdkMessage, { type: 'result' }>['subtype']
  uuid?: string
}): SdkMessage {
  return {
    type: 'result',
    subtype:
      args.subtype ?? (args.isError ? 'error_during_execution' : 'success'),
    ...(args.result !== undefined ? { result: args.result } : {}),
    ...(args.structuredOutput
      ? { structured_output: args.structuredOutput }
      : {}),
    num_turns: args.numTurns,
    usage: args.usage,
    total_cost_usd: args.totalCostUsd,
    duration_ms: args.durationMs,
    duration_api_ms: args.durationApiMs,
    is_error: args.isError,
    session_id: args.sessionId,
    ...(args.uuid ? { uuid: args.uuid } : {}),
  }
}
