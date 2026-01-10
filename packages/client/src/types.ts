import type { AgentEvent, Session } from '@kode/protocol'

export type ToolPermissionDecision = 'allow_once' | 'allow_always' | 'deny'

export type ToolPermissionInputUpdate = Record<string, unknown>

/**
 * KodeClient is the UI-facing SDK for driving a Kode session.
 *
 * Implementations:
 * - DirectClient: in-process (CLI/VSCode/Desktop main process)
 * - HttpClient: remote (Web, or any client that talks to `apps/server`)
 */
export interface KodeClient {
  /**
   * Send a user message and stream back events until the request completes.
   */
  sendMessage(message: string): AsyncGenerator<AgentEvent>

  /**
   * Cancel the active request, if any.
   */
  cancelRequest(): void

  /**
   * Approve an in-flight tool permission request.
   *
   * `toolUseId` maps to the request identifier emitted by the server. In
   * daemon/WS mode this is aligned to the tool_use id when available.
   */
  approveToolUse(
    toolUseId: string,
    options?: {
      decision?: Exclude<ToolPermissionDecision, 'deny'>
      updatedInput?: ToolPermissionInputUpdate | null
    },
  ): Promise<void>

  /**
   * Deny an in-flight tool permission request.
   */
  denyToolUse(
    toolUseId: string,
    reason?: string,
    options?: { updatedInput?: ToolPermissionInputUpdate | null },
  ): Promise<void>

  /**
   * List known sessions for the current workspace.
   */
  listSessions(): Promise<Session[]>

  /**
   * Load a session. Implementations may return metadata-only if full message
   * history is not available via a single call.
   */
  loadSession(sessionId: string): Promise<Session>

  /**
   * Delete a session and its persisted history (if supported).
   */
  deleteSession(sessionId: string): Promise<void>

  /**
   * True when the underlying transport is connected.
   */
  isConnected(): boolean

  /**
   * Disconnect the underlying transport.
   */
  disconnect(): void
}
