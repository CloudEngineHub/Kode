import type { WrappedClient } from '#core/mcp/client'

export const ACP_MAX_ACTIVE_SESSIONS = 100

export type ManagedAcpSession = {
  sessionId: string
  activeAbortController?: AbortController | null
  sessionOwnedMcpClients?: WrappedClient[]
}

type SessionEntry<T extends ManagedAcpSession> = {
  session: T
  lastAccessedAt: number
}

export async function closeSessionOwnedMcpClients(
  session: ManagedAcpSession,
): Promise<void> {
  const clients = session.sessionOwnedMcpClients ?? []
  for (const client of clients) {
    if (client.type !== 'connected') continue
    try {
      await client.client.close()
    } catch {}
  }
  session.sessionOwnedMcpClients = []
}

export class AcpSessionManager<T extends ManagedAcpSession> {
  private readonly sessions = new Map<string, SessionEntry<T>>()

  constructor(
    private readonly options: {
      maxSessions?: number
      ttlMs?: number
      now?: () => number
    } = {},
  ) {}

  get size(): number {
    return this.sessions.size
  }

  get(sessionId: string): T | undefined {
    const entry = this.sessions.get(sessionId)
    if (!entry) return undefined
    entry.lastAccessedAt = this.now()
    return entry.session
  }

  values(): T[] {
    return Array.from(this.sessions.values(), entry => entry.session)
  }

  async set(sessionId: string, session: T): Promise<void> {
    const existing = this.sessions.get(sessionId)
    if (existing && existing.session !== session) {
      existing.session.activeAbortController?.abort()
      await closeSessionOwnedMcpClients(existing.session)
    }

    this.sessions.set(sessionId, {
      session,
      lastAccessedAt: this.now(),
    })
    await this.evictIfNeeded()
  }

  async delete(sessionId: string): Promise<void> {
    const existing = this.sessions.get(sessionId)
    if (!existing) return
    this.sessions.delete(sessionId)
    existing.session.activeAbortController?.abort()
    await closeSessionOwnedMcpClients(existing.session)
  }

  async cleanupExpired(): Promise<void> {
    const ttlMs = this.options.ttlMs
    if (!ttlMs || ttlMs <= 0) return

    const now = this.now()
    for (const [sessionId, entry] of this.sessions.entries()) {
      if (now - entry.lastAccessedAt <= ttlMs) continue
      await this.delete(sessionId)
    }
  }

  clear(): void {
    for (const entry of this.sessions.values()) {
      entry.session.activeAbortController?.abort()
      void closeSessionOwnedMcpClients(entry.session)
    }
    this.sessions.clear()
  }

  private now(): number {
    return this.options.now?.() ?? Date.now()
  }

  private async evictIfNeeded(): Promise<void> {
    const maxSessions = this.options.maxSessions ?? ACP_MAX_ACTIVE_SESSIONS
    while (this.sessions.size > maxSessions) {
      let oldestSessionId: string | null = null
      let oldestAccess = Infinity

      for (const [sessionId, entry] of this.sessions.entries()) {
        if (entry.lastAccessedAt >= oldestAccess) continue
        oldestAccess = entry.lastAccessedAt
        oldestSessionId = sessionId
      }

      if (!oldestSessionId) return
      await this.delete(oldestSessionId)
    }
  }
}
