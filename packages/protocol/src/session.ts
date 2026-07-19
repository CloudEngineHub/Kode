/**
 * Session metadata as transferred over the server/web socket.
 *
 * Note: Dates are serialized as ISO strings (or `null`) over the wire.
 */
import type { AgentEvent } from './agentEvent'

export type Session = {
  sessionId: string
  slug: string | null
  customTitle: string | null
  tag: string | null
  summary: string | null
  cwd: string | null
  createdAt: string | null
  modifiedAt: string | null
  /** Present for sessions created by the persistent-session fork API. */
  forkedFromSessionId?: string | null
  forkRootSessionId?: string | null
  /** A server-owned archive tombstone; omitted for legacy session records. */
  archivedAt?: string | null
  events?: AgentEvent[]
}
