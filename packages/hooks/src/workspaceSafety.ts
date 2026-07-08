import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { getKodeRoot } from '#config/dataRoots'

export type WorkspacePeer = {
  pid: number
  agentId?: string
  sessionId?: string
  workspaceKey: string
  cwd?: string
  branch?: string
  startedAt?: number
  lastSeenAt: number
  filePath: string
}

export type WorkspacePeerProvider = (args: {
  cwd: string
  maxAgeMs?: number
}) => WorkspacePeer[]

let workspacePeerProvider: WorkspacePeerProvider | null = null

type PresenceRecord = {
  pid?: unknown
  agentId?: unknown
  sessionId?: unknown
  workspaceKey?: unknown
  cwd?: unknown
  branch?: unknown
  startedAt?: unknown
  lastSeenAt?: unknown
}

function sanitizeWorkspaceKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-')
}

function safeParseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function getGitTopLevelBestEffort(cwd: string): string | null {
  try {
    const stdout = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 750,
    })
    const root = stdout.toString('utf8').trim()
    return root || null
  } catch {
    return null
  }
}

function getWorkspaceKey(cwd: string): string {
  const gitTopLevel = getGitTopLevelBestEffort(cwd) ?? cwd
  return sanitizeWorkspaceKey(gitTopLevel)
}

function getWorkspaceAgentsDir(workspaceKey: string): string {
  return join(getKodeRoot(), 'workspaces', workspaceKey, 'agents')
}

function isPresenceRecord(value: unknown): value is PresenceRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function toWorkspacePeer(args: {
  filePath: string
  record: PresenceRecord
  mtimeMs: number
}): WorkspacePeer | null {
  const pid =
    typeof args.record.pid === 'number' && Number.isFinite(args.record.pid)
      ? Math.trunc(args.record.pid)
      : null
  if (!pid || pid <= 0) return null

  const workspaceKey =
    typeof args.record.workspaceKey === 'string' &&
    args.record.workspaceKey.trim()
      ? args.record.workspaceKey.trim()
      : null
  if (!workspaceKey) return null

  const lastSeenAt =
    typeof args.record.lastSeenAt === 'number' &&
    Number.isFinite(args.record.lastSeenAt)
      ? args.record.lastSeenAt
      : args.mtimeMs

  return {
    pid,
    workspaceKey,
    filePath: args.filePath,
    lastSeenAt,
    agentId:
      typeof args.record.agentId === 'string' ? args.record.agentId : undefined,
    sessionId:
      typeof args.record.sessionId === 'string'
        ? args.record.sessionId
        : undefined,
    cwd: typeof args.record.cwd === 'string' ? args.record.cwd : undefined,
    branch:
      typeof args.record.branch === 'string' ? args.record.branch : undefined,
    startedAt:
      typeof args.record.startedAt === 'number' &&
      Number.isFinite(args.record.startedAt)
        ? args.record.startedAt
        : undefined,
  }
}

function listActiveWorkspacePeersFromDisk(args: {
  cwd: string
  maxAgeMs?: number
}): WorkspacePeer[] {
  const now = Date.now()
  const maxAgeMs = args.maxAgeMs ?? 30_000
  const workspaceKey = getWorkspaceKey(args.cwd)
  const agentsDir = getWorkspaceAgentsDir(workspaceKey)
  if (!existsSync(agentsDir)) return []

  const peers: WorkspacePeer[] = []
  try {
    for (const name of readdirSync(agentsDir)) {
      if (!name.endsWith('.json')) continue
      const filePath = join(agentsDir, name)
      let stat: { mtimeMs: number } | null = null
      try {
        stat = statSync(filePath)
      } catch {
        continue
      }

      const raw = (() => {
        try {
          return readFileSync(filePath, 'utf8')
        } catch {
          return null
        }
      })()
      if (!raw) continue

      const parsed = safeParseJson<unknown>(raw)
      if (!isPresenceRecord(parsed)) continue

      const peer = toWorkspacePeer({
        filePath,
        record: parsed,
        mtimeMs: stat.mtimeMs,
      })
      if (!peer) continue
      if (peer.pid === process.pid) continue
      if (now - peer.lastSeenAt > maxAgeMs) continue
      peers.push(peer)
    }
  } catch {
    return []
  }

  peers.sort((a, b) => b.lastSeenAt - a.lastSeenAt)
  return peers
}

export function setWorkspacePeerProvider(
  provider: WorkspacePeerProvider | null,
): void {
  workspacePeerProvider = provider
}

export function listActiveWorkspacePeers(args: {
  cwd: string
  maxAgeMs?: number
}): WorkspacePeer[] {
  return workspacePeerProvider?.(args) ?? listActiveWorkspacePeersFromDisk(args)
}

export function __resetWorkspacePeerProviderForTests(): void {
  workspacePeerProvider = null
}
