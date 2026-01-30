import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  watch,
  writeFileSync,
} from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'

import { getKodeRoot } from '#config/dataRoots'
import { emitReminderEvent } from '#core/services/systemReminder'
import { registerObservation } from '#core/services/observationHub'
import { debug as debugLogger } from '#core/utils/debugLogger'
import { logError } from '#core/utils/log'
import { getEffectiveSessionId } from '#core/utils/sessionId'

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

function safeMkdir(dirPath: string): void {
  try {
    mkdirSync(dirPath, { recursive: true })
  } catch {
    // best-effort
  }
}

function safeUnlink(path: string): void {
  try {
    unlinkSync(path)
  } catch {
    // best-effort
  }
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

function getGitBranchBestEffort(cwd: string): string | undefined {
  try {
    const stdout = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 750,
    })
    const branch = stdout.toString('utf8').trim()
    if (!branch || branch === 'HEAD') return undefined
    return branch
  } catch {
    return undefined
  }
}

function getGitDirBestEffort(cwd: string): string | null {
  try {
    const stdout = execFileSync('git', ['rev-parse', '--git-dir'], {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 750,
    })
    const gitDir = stdout.toString('utf8').trim()
    return gitDir || null
  } catch {
    return null
  }
}

function resolveGitHeadPath(cwd: string): string | null {
  const gitDir = getGitDirBestEffort(cwd)
  if (!gitDir) return null
  let resolved = isAbsolute(gitDir) ? gitDir : join(cwd, gitDir)

  // In worktrees, `git rev-parse --git-dir` can return a `.git` file that
  // points at the real gitdir. Best-effort resolve it so fs.watch can be used.
  try {
    const st = statSync(resolved)
    if (st.isFile()) {
      const raw = readFileSync(resolved, 'utf8')
      const match = raw.match(/gitdir:\s*(.+)\s*$/i)
      const target = match?.[1]?.trim()
      if (target) {
        resolved = isAbsolute(target) ? target : join(dirname(resolved), target)
      }
    }
  } catch {
    // best-effort
  }

  return join(resolved, 'HEAD')
}

function getWorkspaceKey(cwd: string): string {
  const gitTopLevel = getGitTopLevelBestEffort(cwd) ?? cwd
  return sanitizeWorkspaceKey(gitTopLevel)
}

function getWorkspaceAgentsDir(workspaceKey: string): string {
  return join(getKodeRoot(), 'workspaces', workspaceKey, 'agents')
}

function getSelfPresenceFilePath(args: {
  workspaceKey: string
  agentId: string
}): string {
  const safeAgentId = sanitizeWorkspaceKey(args.agentId)
  return join(
    getWorkspaceAgentsDir(args.workspaceKey),
    `agent-${safeAgentId}-${process.pid}.json`,
  )
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

class WorkspaceSafetyService {
  public listActivePeers(args: {
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
    } catch (error) {
      logError(error)
      return []
    }

    peers.sort((a, b) => b.lastSeenAt - a.lastSeenAt)
    return peers
  }
}

export const workspaceSafetyService = new WorkspaceSafetyService()

registerObservation({
  id: 'workspace_presence',
  description: 'Workspace presence heartbeat for peer safety checks',
  getInstanceKey(ctx) {
    return getWorkspaceKey(ctx.cwd)
  },
  start(ctx) {
    const workspaceKey = getWorkspaceKey(ctx.cwd)
    const agentId = ctx.agentId || 'main'
    const cwd = ctx.cwd

    const presencePath = getSelfPresenceFilePath({ workspaceKey, agentId })
    const startedAt = Date.now()

    const writePresence = () => {
      try {
        safeMkdir(dirname(presencePath))
        const now = Date.now()
        const branch = getGitBranchBestEffort(cwd)
        const record: Required<
          Pick<
            WorkspacePeer,
            'pid' | 'workspaceKey' | 'filePath' | 'lastSeenAt'
          >
        > &
          Omit<
            WorkspacePeer,
            'filePath' | 'lastSeenAt' | 'pid' | 'workspaceKey'
          > = {
          pid: process.pid,
          workspaceKey,
          filePath: presencePath,
          lastSeenAt: now,
          agentId,
          sessionId: getEffectiveSessionId(),
          cwd,
          branch,
          startedAt,
        }

        writeFileSync(presencePath, JSON.stringify(record, null, 2), {
          encoding: 'utf8',
          mode: 0o600,
        })
      } catch (error) {
        logError(error)
        debugLogger.warn('WORKSPACE_PRESENCE_WRITE_FAILED', {
          workspaceKey,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    writePresence()
    const timer = setInterval(writePresence, 5000)
    timer.unref?.()

    return () => {
      clearInterval(timer)
      safeUnlink(presencePath)
    }
  },
})

registerObservation({
  id: 'workspace_git_branch',
  description: 'Detect git branch changes in the current worktree',
  getInstanceKey(ctx) {
    return getWorkspaceKey(ctx.cwd)
  },
  start(ctx) {
    const workspaceKey = getWorkspaceKey(ctx.cwd)
    const cwd = ctx.cwd

    let lastBranch = getGitBranchBestEffort(cwd)

    const check = () => {
      const previous = lastBranch
      const current = getGitBranchBestEffort(cwd)

      // Track state even when undefined (e.g. detached HEAD).
      lastBranch = current
      const previousLabel = previous ?? '(detached)'
      const currentLabel = current ?? '(detached)'
      if (previousLabel === currentLabel) return

      emitReminderEvent('reminder:inject', {
        type: 'workspace_branch_changed',
        category: 'general',
        priority: 'high',
        timestamp: Date.now(),
        reminder:
          `Detected a git HEAD change in this worktree (${previousLabel} → ${currentLabel}). ` +
          'Assume another agent or a human may have switched branches. ' +
          'Verify whether your in-progress work is still present (git status, uncommitted changes, recent file edits). ' +
          'If there is medium+ impact, stop and report the issue and its impact to the user; otherwise continue.',
      })
    }

    const headPath = resolveGitHeadPath(cwd)

    let pollTimer: NodeJS.Timeout | null = null
    let watcher: ReturnType<typeof watch> | null = null
    let debounce: NodeJS.Timeout | null = null

    const stopWatch = () => {
      if (debounce) clearTimeout(debounce)
      debounce = null
      if (watcher) {
        try {
          watcher.close()
        } catch {
          // ignore
        }
      }
      watcher = null
    }

    const stopPoll = () => {
      if (pollTimer) clearInterval(pollTimer)
      pollTimer = null
    }

    const startPoll = () => {
      stopPoll()
      const timer = setInterval(check, 4000)
      timer.unref?.()
      pollTimer = timer
    }

    if (headPath && existsSync(headPath)) {
      try {
        watcher = watch(headPath, { persistent: false }, () => {
          if (debounce) clearTimeout(debounce)
          const t = setTimeout(check, 150)
          t.unref?.()
          debounce = t
        })
        watcher.on('error', error => {
          logError(error)
          debugLogger.warn('WORKSPACE_HEAD_WATCH_ERROR', {
            workspaceKey,
            error: error instanceof Error ? error.message : String(error),
          })
          stopWatch()
          startPoll()
        })
      } catch (error) {
        logError(error)
        debugLogger.warn('WORKSPACE_HEAD_WATCH_SETUP_FAILED', {
          workspaceKey,
          headPath,
          error: error instanceof Error ? error.message : String(error),
        })
        startPoll()
      }
    } else {
      startPoll()
    }

    return () => {
      stopWatch()
      stopPoll()
    }
  },
})
