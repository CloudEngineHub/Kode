export type ControlRequestMessage = {
  type: 'control_request'
  request_id: string
  request: { subtype: string; [key: string]: unknown }
}

export type KeepAliveMessage = { type: 'keep_alive' }

export type ControlResponseMessage = {
  type: 'control_response'
  response: {
    request_id: string
    subtype: 'success' | 'error'
    response?: unknown
    error?: string
  }
}

export type ControlCancelRequestMessage = {
  type: 'control_cancel_request'
  request_id: string
}

export type UserInputMessage = {
  type: 'user'
  uuid?: string
  parent_tool_use_id?: string | null
  message: { role: 'user'; content: unknown }
}

export type StructuredInputMessage =
  | ControlRequestMessage
  | ControlResponseMessage
  | ControlCancelRequestMessage
  | UserInputMessage
  | KeepAliveMessage
  | { type: string; [key: string]: unknown }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function tryParseStructuredInputLine(
  line: string,
): StructuredInputMessage | null {
  if (!line.trim()) return null
  try {
    const parsed = JSON.parse(line) as unknown
    if (!isRecord(parsed)) return null
    if (typeof parsed.type !== 'string') return null
    return parsed as StructuredInputMessage
  } catch {
    return null
  }
}
