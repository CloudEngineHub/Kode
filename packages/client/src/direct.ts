import type { AgentEvent, Session } from '@kode/protocol'

import type {
  KodeClient,
  ToolPermissionDecision,
  ToolPermissionInputUpdate,
} from './types'

export interface DirectEngine {
  sendMessage(message: string): AsyncGenerator<AgentEvent>
  cancelRequest(): void
  approveToolUse(
    toolUseId: string,
    options?: {
      decision?: Exclude<ToolPermissionDecision, 'deny'>
      updatedInput?: ToolPermissionInputUpdate | null
    },
  ): Promise<void>
  denyToolUse(
    toolUseId: string,
    reason?: string,
    options?: { updatedInput?: ToolPermissionInputUpdate | null },
  ): Promise<void>
  listSessions(): Promise<Session[]>
  loadSession(sessionId: string): Promise<Session>
  deleteSession(sessionId: string): Promise<void>
  isConnected(): boolean
  disconnect(): void
}

/**
 * DirectClient is an in-process implementation that delegates to a host-provided
 * engine adapter, keeping `@kode/client` core-free.
 */
export class DirectClient implements KodeClient {
  constructor(private readonly engine: DirectEngine) {}

  sendMessage(message: string): AsyncGenerator<AgentEvent> {
    return this.engine.sendMessage(message)
  }

  cancelRequest(): void {
    return this.engine.cancelRequest()
  }

  approveToolUse(
    toolUseId: string,
    options?: {
      decision?: Exclude<ToolPermissionDecision, 'deny'>
      updatedInput?: ToolPermissionInputUpdate | null
    },
  ): Promise<void> {
    return this.engine.approveToolUse(toolUseId, options)
  }

  denyToolUse(
    toolUseId: string,
    reason?: string,
    options?: { updatedInput?: ToolPermissionInputUpdate | null },
  ): Promise<void> {
    return this.engine.denyToolUse(toolUseId, reason, options)
  }

  listSessions(): Promise<Session[]> {
    return this.engine.listSessions()
  }

  loadSession(sessionId: string): Promise<Session> {
    return this.engine.loadSession(sessionId)
  }

  deleteSession(sessionId: string): Promise<void> {
    return this.engine.deleteSession(sessionId)
  }

  isConnected(): boolean {
    return this.engine.isConnected()
  }

  disconnect(): void {
    return this.engine.disconnect()
  }
}
