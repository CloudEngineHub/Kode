import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { logError } from '#core/utils/log'
import { getKodeBaseDir } from '#core/utils/env'

import type * as Protocol from '../protocol'
import type { SessionState } from './types'

const ACP_SESSION_STORE_VERSION = 1

type PersistedAcpSession = {
  version: number
  sessionId: string
  cwd: string
  mcpServers: Protocol.McpServer[]
  messages: SessionState['messages']
  toolPermissionContext: SessionState['toolPermissionContext']
  readFileTimestamps: SessionState['readFileTimestamps']
  responseState: SessionState['responseState']
  currentModeId: Protocol.SessionModeId
}

function getProjectDirSlug(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-')
}

function sanitizeSessionId(sessionId: string): string {
  return sessionId.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function getAcpSessionDir(cwd: string): string {
  return join(getKodeBaseDir(), getProjectDirSlug(cwd), 'acp-sessions')
}

function getAcpSessionFilePath(cwd: string, sessionId: string): string {
  return join(getAcpSessionDir(cwd), `${sanitizeSessionId(sessionId)}.json`)
}

export function persistAcpSessionToDisk(session: SessionState): void {
  try {
    const dir = getAcpSessionDir(session.cwd)
    mkdirSync(dir, { recursive: true })

    const payload: PersistedAcpSession = {
      version: ACP_SESSION_STORE_VERSION,
      sessionId: session.sessionId,
      cwd: session.cwd,
      mcpServers: session.mcpServers,
      messages: session.messages,
      toolPermissionContext: session.toolPermissionContext,
      readFileTimestamps: session.readFileTimestamps,
      responseState: session.responseState,
      currentModeId: session.currentModeId,
    }

    const path = getAcpSessionFilePath(session.cwd, session.sessionId)
    writeFileSync(path, JSON.stringify(payload, null, 2), 'utf8')
  } catch (e) {
    logError(e)
  }
}

export function loadAcpSessionFromDisk(
  cwd: string,
  sessionId: string,
): PersistedAcpSession | null {
  try {
    const path = getAcpSessionFilePath(cwd, sessionId)
    if (!existsSync(path)) return null
    const raw = readFileSync(path, 'utf8')
    const parsed = JSON.parse(raw) as PersistedAcpSession
    if (!parsed || typeof parsed !== 'object') return null
    if (parsed.sessionId !== sessionId) return null
    if (typeof parsed.cwd !== 'string' || parsed.cwd !== cwd) return null
    if (!Array.isArray(parsed.messages)) return null
    return parsed
  } catch {
    return null
  }
}
