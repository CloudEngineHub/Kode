import type * as Protocol from '../protocol'

import type { Message } from '#core/query'
import type { Tool, ToolUseContext } from '#core/tooling/Tool'
import type { ToolPermissionContext } from '#core/types/toolPermissionContext'
import type { WrappedClient } from '#core/mcp/client'

export type AcpCommand = {
  name: string
  description: string
  isHidden: boolean
  argumentHint?: string
  userFacingName(): string
}

export type ToolCallState = {
  title: string
  kind: Protocol.ToolKind
  status: Protocol.ToolCallStatus
  rawInput?: Protocol.JsonObject
  fileSnapshot?: {
    path: string
    content: string
  }
}

export type SessionState = {
  sessionId: string
  cwd: string
  mcpServers: Protocol.McpServer[]
  mcpClients: WrappedClient[]

  commands: AcpCommand[]
  tools: Tool[]

  systemPrompt: string[]
  context: Record<string, string>

  messages: Message[]
  toolPermissionContext: ToolPermissionContext
  readFileTimestamps: Record<string, number>
  responseState: ToolUseContext['responseState']

  currentModeId: Protocol.SessionModeId
  activeAbortController: AbortController | null

  toolCalls: Map<string, ToolCallState>
}
