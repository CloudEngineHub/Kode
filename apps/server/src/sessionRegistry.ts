import { resolve } from 'node:path'

import { loadToolPermissionContextFromDisk } from '@kode/core/utils/permissions/toolPermissionSettings'

import { loadSessionMessages } from './handlers/session.handler'
import { denyAllPermissionRequests } from './ws/permissionRequests'
import type { DaemonSession } from './ws/types'

export type SessionLookupResult =
  | { ok: true; session: DaemonSession; restored: boolean }
  | { ok: false; reason: 'not_found' | 'cwd_mismatch' }

export const DEFAULT_MAX_IDLE_SESSIONS = 100

function isIdleSession(session: DaemonSession): boolean {
  return (
    session.clients.size === 0 &&
    session.turnInFlight === false &&
    session.activeAbortController === null &&
    session.inflightPermissionRequests.size === 0
  )
}

export function createDaemonSession(args: {
  cwd: string
  sessionId?: string
  messages?: DaemonSession['messages']
}): DaemonSession {
  const cwd = resolve(args.cwd)
  return {
    sessionId: args.sessionId ?? crypto.randomUUID(),
    cwd,
    clients: new Set(),
    messages: args.messages ?? [],
    readFileTimestamps: {},
    responseState: {},
    toolPermissionContext: loadToolPermissionContextFromDisk({
      projectDir: cwd,
      includeKodeProjectConfig: true,
      isBypassPermissionsModeAvailable: true,
    }),
    activeAbortController: null,
    turnInFlight: false,
    inflightPermissionRequests: new Map(),
  }
}

export class SessionRegistry {
  private readonly maxIdleSessions: number

  constructor(
    private readonly sessions: Map<string, DaemonSession> = new Map(),
    options: { maxIdleSessions?: number } = {},
  ) {
    const configured = options.maxIdleSessions ?? DEFAULT_MAX_IDLE_SESSIONS
    this.maxIdleSessions = Number.isFinite(configured)
      ? Math.max(1, Math.floor(configured))
      : DEFAULT_MAX_IDLE_SESSIONS
  }

  get size(): number {
    return this.sessions.size
  }

  get(sessionId: string): DaemonSession | null {
    return this.sessions.get(sessionId) ?? null
  }

  create(cwd: string): DaemonSession {
    const session = createDaemonSession({ cwd })
    this.sessions.set(session.sessionId, session)
    this.evictIdleSessions({ preserve: session })
    return session
  }

  deleteIfIdle(session: DaemonSession): boolean {
    if (this.sessions.get(session.sessionId) !== session) return false
    if (!isIdleSession(session)) return false
    return this.sessions.delete(session.sessionId)
  }

  evictIdleSessions(options: { preserve?: DaemonSession } = {}): number {
    let idleCount = 0
    for (const session of this.sessions.values()) {
      if (isIdleSession(session)) idleCount += 1
    }
    if (idleCount <= this.maxIdleSessions) return 0

    let evicted = 0
    for (const [sessionId, session] of this.sessions) {
      if (idleCount <= this.maxIdleSessions) break
      if (session === options.preserve || !isIdleSession(session)) continue
      this.sessions.delete(sessionId)
      idleCount -= 1
      evicted += 1
    }
    return evicted
  }

  cancelActiveWork(message: string): void {
    for (const session of this.sessions.values()) {
      try {
        session.activeAbortController?.abort()
      } catch {}
      denyAllPermissionRequests(session, message)
    }
  }

  getOrLoad(args: { cwd: string; sessionId: string }): SessionLookupResult {
    const cwd = resolve(args.cwd)
    const active = this.sessions.get(args.sessionId)
    if (active) {
      if (resolve(active.cwd) !== cwd) {
        return { ok: false, reason: 'cwd_mismatch' }
      }
      return { ok: true, session: active, restored: false }
    }

    try {
      const messages = loadSessionMessages({ cwd, sessionId: args.sessionId })
      const session = createDaemonSession({
        cwd,
        sessionId: args.sessionId,
        messages,
      })
      this.sessions.set(session.sessionId, session)
      this.evictIdleSessions({ preserve: session })
      return { ok: true, session, restored: true }
    } catch {
      return { ok: false, reason: 'not_found' }
    }
  }
}
