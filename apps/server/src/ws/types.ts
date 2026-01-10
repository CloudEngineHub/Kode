import type { Message } from '@kode/core/query'
import type { ToolUseContext } from '@kode/core/tooling/Tool'
import type { ToolPermissionContext } from '@kode/core/types/toolPermissionContext'

export type InflightPermissionDecision = {
  decision: 'allow_once' | 'allow_always' | 'deny'
  updatedInput?: Record<string, unknown> | null
  rejectionMessage?: string | null
}

export type DaemonSession = {
  sessionId: string
  cwd: string
  ws: { send: (data: string) => void } | null
  messages: Message[]
  readFileTimestamps: Record<string, number>
  responseState: ToolUseContext['responseState']
  toolPermissionContext: ToolPermissionContext
  activeAbortController: AbortController | null
  inflightPermissionRequests: Map<
    string,
    (value: InflightPermissionDecision) => void
  >
}
