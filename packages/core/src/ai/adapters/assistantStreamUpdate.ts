import type {
  AssistantStreamUpdate,
  ToolUseContext,
} from '@kode/tool-interface/Tool'

export type AssistantStreamUpdateOptions = {
  onAssistantStreamUpdate?: NonNullable<
    ToolUseContext['options']
  >['onAssistantStreamUpdate']
  agentId?: string
  requestId?: string
}

type AssistantStreamUpdatePayload =
  { type: 'start' } | { type: 'text_delta'; delta: string }

export function emitAssistantStreamUpdate(
  options: AssistantStreamUpdateOptions | undefined,
  payload: AssistantStreamUpdatePayload,
): void {
  const callback = options?.onAssistantStreamUpdate
  if (typeof callback !== 'function') return

  const metadata = {
    ...(options?.agentId !== undefined ? { agentId: options.agentId } : {}),
    ...(options?.requestId !== undefined
      ? { requestId: options.requestId }
      : {}),
  }
  const event: AssistantStreamUpdate =
    payload.type === 'start'
      ? { type: 'start', ...metadata }
      : { type: 'text_delta', delta: payload.delta, ...metadata }

  try {
    const result = callback(event)
    if (result) void result.catch(() => {})
  } catch {}
}
