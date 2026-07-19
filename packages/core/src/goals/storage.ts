import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'

import { getKodeRoot } from '#config/dataRoots'

import {
  GOAL_SCHEMA_VERSION,
  type Goal,
  type GoalEvent,
  type GoalStatus,
  type GoalStorageOptions,
  type IntervalSchedule,
  type OnceSchedule,
  type Schedule,
} from './types'

const GOALS_DIRNAME = 'goals'
const GOAL_FILENAME = 'goal.json'
const EVENTS_FILENAME = 'events.jsonl'
const LOCK_FILENAME = '.lock'
const LOCK_STALE_MS = 30_000
const LOCK_RETRIES = 20
const LOCK_RETRY_DELAY_MS = 15

const GOAL_STATUSES = new Set<GoalStatus>([
  'scheduled',
  'running',
  'awaiting_approval',
  'paused',
  'completed',
  'failed',
  'cancelled',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function cleanStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  return value.filter(isNonEmptyString).map(value => value.trim())
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function sleepSync(ms: number): void {
  if (ms <= 0) return
  const buffer = new SharedArrayBuffer(4)
  Atomics.wait(new Int32Array(buffer), 0, 0, ms)
}

function safeUnlink(path: string): void {
  try {
    unlinkSync(path)
  } catch {
    // Cleanup is deliberately best effort. The original write error still wins.
  }
}

function safeMkdir(path: string): void {
  mkdirSync(path, { recursive: true })
}

function atomicWriteText(path: string, content: string): void {
  safeMkdir(dirname(path))
  const temporaryPath = `${path}.tmp.${process.pid}.${randomUUID()}`
  writeFileSync(temporaryPath, content, { encoding: 'utf8', mode: 0o600 })
  try {
    renameSync(temporaryPath, path)
  } catch (error) {
    // On Windows, rename-over-existing can fail despite a per-goal lock.
    const code = (error as NodeJS.ErrnoException | undefined)?.code
    const canFallback = [
      'EPERM',
      'EACCES',
      'EEXIST',
      'ENOTEMPTY',
      'EBUSY',
    ].includes(String(code ?? ''))
    if (!canFallback) {
      safeUnlink(temporaryPath)
      throw error
    }
    try {
      writeFileSync(path, content, { encoding: 'utf8', mode: 0o600 })
    } finally {
      safeUnlink(temporaryPath)
    }
  }
}

function acquireLock(lockPath: string): () => void {
  safeMkdir(dirname(lockPath))
  for (let attempt = 0; attempt < LOCK_RETRIES; attempt += 1) {
    try {
      const descriptor = openSync(lockPath, 'wx', 0o600)
      try {
        writeFileSync(descriptor, `${process.pid} ${Date.now()}\n`, 'utf8')
      } finally {
        closeSync(descriptor)
      }
      return () => safeUnlink(lockPath)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code
      if (code !== 'EEXIST') throw error
      try {
        if (Date.now() - statSync(lockPath).mtimeMs > LOCK_STALE_MS) {
          safeUnlink(lockPath)
        }
      } catch {
        // A competing writer may have released it between exists/stat; retry.
      }
      sleepSync(LOCK_RETRY_DELAY_MS)
    }
  }
  throw new Error(`Failed to acquire goal store lock: ${lockPath}`)
}

function parseSchedule(value: unknown): Schedule | null {
  if (!isRecord(value)) return null
  const commonValid =
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.goalId) &&
    isNonEmptyString(value.cwd) &&
    isNonEmptyString(value.sessionId) &&
    isNonEmptyString(value.prompt) &&
    (value.nextRunAt === null || isFiniteNumber(value.nextRunAt)) &&
    (value.retryAt === undefined || isFiniteNumber(value.retryAt)) &&
    (value.lastClaimedAt === undefined || isFiniteNumber(value.lastClaimedAt))
  if (!commonValid) return null

  const base = {
    id: String(value.id).trim(),
    goalId: String(value.goalId).trim(),
    cwd: String(value.cwd).trim(),
    sessionId: String(value.sessionId).trim(),
    prompt: String(value.prompt).trim(),
    nextRunAt: value.nextRunAt as number | null,
    ...(isFiniteNumber(value.retryAt) ? { retryAt: value.retryAt } : {}),
    ...(isFiniteNumber(value.lastClaimedAt)
      ? { lastClaimedAt: value.lastClaimedAt }
      : {}),
  }

  if (value.kind === 'once' && isFiniteNumber(value.runAt)) {
    return { ...base, kind: 'once', runAt: value.runAt } satisfies OnceSchedule
  }
  if (
    value.kind === 'interval' &&
    isFiniteNumber(value.everyMs) &&
    value.everyMs > 0 &&
    isFiniteNumber(value.anchorAt)
  ) {
    return {
      ...base,
      kind: 'interval',
      everyMs: value.everyMs,
      anchorAt: value.anchorAt,
    } satisfies IntervalSchedule
  }
  return null
}

function parseGoal(value: unknown): Goal | null {
  if (!isRecord(value)) return null
  if (value.schemaVersion !== GOAL_SCHEMA_VERSION) return null
  if (
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.cwd) ||
    !isNonEmptyString(value.sessionId) ||
    !isNonEmptyString(value.objective) ||
    !GOAL_STATUSES.has(value.status as GoalStatus) ||
    !isFiniteNumber(value.revision) ||
    !isFiniteNumber(value.createdAt) ||
    !isFiniteNumber(value.updatedAt)
  ) {
    return null
  }

  const acceptanceCriteria = cleanStringArray(value.acceptanceCriteria)
  const schedule = parseSchedule(value.schedule)
  if (!acceptanceCriteria || !schedule || schedule.goalId !== value.id.trim()) {
    return null
  }

  const loopRecord = isRecord(value.loop) ? value.loop : null
  if (
    !loopRecord ||
    !isFiniteNumber(loopRecord.maxIterations) ||
    loopRecord.maxIterations < 1 ||
    !isNonEmptyString(loopRecord.continuationPrompt)
  ) {
    return null
  }

  const goal: Goal = {
    schemaVersion: GOAL_SCHEMA_VERSION,
    id: value.id.trim(),
    cwd: value.cwd.trim(),
    sessionId: value.sessionId.trim(),
    objective: value.objective.trim(),
    acceptanceCriteria,
    status: value.status as GoalStatus,
    schedule,
    loop: {
      maxIterations: Math.max(1, Math.floor(loopRecord.maxIterations)),
      continuationPrompt: loopRecord.continuationPrompt.trim(),
    },
    revision: Math.max(0, Math.floor(value.revision)),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  }

  if (isFiniteNumber(value.completedAt)) goal.completedAt = value.completedAt
  if (isNonEmptyString(value.pausedReason))
    goal.pausedReason = value.pausedReason.trim()
  if (isRecord(value.lastError)) {
    if (
      isNonEmptyString(value.lastError.code) &&
      isNonEmptyString(value.lastError.message) &&
      isFiniteNumber(value.lastError.at)
    ) {
      goal.lastError = {
        code: value.lastError.code.trim(),
        message: value.lastError.message.trim(),
        at: value.lastError.at,
      }
    }
  }
  if (isRecord(value.lease)) {
    if (
      isNonEmptyString(value.lease.ownerId) &&
      isNonEmptyString(value.lease.runId) &&
      isFiniteNumber(value.lease.acquiredAt) &&
      isFiniteNumber(value.lease.expiresAt)
    ) {
      goal.lease = {
        ownerId: value.lease.ownerId.trim(),
        runId: value.lease.runId.trim(),
        acquiredAt: value.lease.acquiredAt,
        expiresAt: value.lease.expiresAt,
      }
    }
  }
  if (isRecord(value.activeRun)) {
    if (
      isNonEmptyString(value.activeRun.id) &&
      isNonEmptyString(value.activeRun.scheduleId) &&
      isFiniteNumber(value.activeRun.scheduledFor) &&
      isFiniteNumber(value.activeRun.startedAt) &&
      isFiniteNumber(value.activeRun.turnCount) &&
      value.activeRun.turnCount >= 0
    ) {
      goal.activeRun = {
        id: value.activeRun.id.trim(),
        scheduleId: value.activeRun.scheduleId.trim(),
        scheduledFor: value.activeRun.scheduledFor,
        startedAt: value.activeRun.startedAt,
        turnCount: Math.floor(value.activeRun.turnCount),
      }
    }
  }
  if (isRecord(value.metadata)) goal.metadata = clone(value.metadata)

  return goal
}

function parseGoalEvent(value: unknown): GoalEvent | null {
  if (!isRecord(value)) return null
  if (
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.goalId) ||
    !isNonEmptyString(value.type) ||
    !isFiniteNumber(value.at) ||
    !isFiniteNumber(value.revision)
  ) {
    return null
  }
  const event: GoalEvent = {
    id: value.id.trim(),
    goalId: value.goalId.trim(),
    type: value.type as GoalEvent['type'],
    at: value.at,
    revision: Math.max(0, Math.floor(value.revision)),
  }
  if (isNonEmptyString(value.from)) event.from = value.from as GoalStatus
  if (isNonEmptyString(value.to)) event.to = value.to as GoalStatus
  if (isNonEmptyString(value.message)) event.message = value.message.trim()
  if (isRecord(value.data)) event.data = clone(value.data)
  return event
}

export function sanitizeGoalId(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_-]/g, '-')
}

export class GoalStorage {
  private readonly rootDir: string

  constructor(options: GoalStorageOptions = {}) {
    this.rootDir = options.rootDir?.trim() || getKodeRoot()
  }

  getGoalsDir(): string {
    return join(this.rootDir, GOALS_DIRNAME)
  }

  getGoalDir(goalId: string): string {
    return join(this.getGoalsDir(), sanitizeGoalId(goalId))
  }

  getGoalFilePath(goalId: string): string {
    return join(this.getGoalDir(goalId), GOAL_FILENAME)
  }

  getEventsFilePath(goalId: string): string {
    return join(this.getGoalDir(goalId), EVENTS_FILENAME)
  }

  private getLockFilePath(goalId: string): string {
    return join(this.getGoalDir(goalId), LOCK_FILENAME)
  }

  private getScopeLockFilePath(cwd: string, sessionId: string): string {
    const key = createHash('sha256')
      .update(`${cwd}\0${sessionId}`)
      .digest('hex')
      .slice(0, 24)
    return join(this.getGoalsDir(), `.scope-${key}.lock`)
  }

  private withGoalLock<T>(goalId: string, operation: () => T): T {
    const release = acquireLock(this.getLockFilePath(goalId))
    try {
      return operation()
    } finally {
      release()
    }
  }

  /**
   * Serializes claims and direct starts for one workspace/session across
   * processes. Per-goal locks cannot enforce the one-active-run invariant.
   */
  withScopeLock<T>(
    args: { cwd: string; sessionId: string },
    operation: () => T,
  ): T {
    const release = acquireLock(
      this.getScopeLockFilePath(args.cwd, args.sessionId),
    )
    try {
      return operation()
    } finally {
      release()
    }
  }

  private readGoalUnsafe(goalId: string): Goal | null {
    const path = this.getGoalFilePath(goalId)
    if (!existsSync(path)) return null
    try {
      return parseGoal(JSON.parse(readFileSync(path, 'utf8')))
    } catch {
      return null
    }
  }

  getGoal(goalId: string): Goal | null {
    const goal = this.readGoalUnsafe(goalId)
    return goal ? clone(goal) : null
  }

  listGoals(): Goal[] {
    const dir = this.getGoalsDir()
    if (!existsSync(dir)) return []
    const goals: Goal[] = []
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      if (!name.isDirectory() || name.name.startsWith('.')) continue
      const goal = this.readGoalUnsafe(name.name)
      if (goal) goals.push(goal)
    }
    return goals.sort(
      (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
    )
  }

  createGoal(goal: Goal): Goal {
    const sanitizedId = sanitizeGoalId(goal.id)
    if (!sanitizedId) throw new Error('Goal ID cannot be empty.')
    return this.withGoalLock(sanitizedId, () => {
      if (this.readGoalUnsafe(sanitizedId)) {
        throw new Error(`Goal already exists: ${sanitizedId}`)
      }
      const normalized = clone({ ...goal, id: sanitizedId })
      normalized.schedule.goalId = sanitizedId
      atomicWriteText(
        this.getGoalFilePath(sanitizedId),
        JSON.stringify(normalized, null, 2),
      )
      return clone(normalized)
    })
  }

  /**
   * Serializes read-modify-write for one goal across processes. Returning null
   * from the mutator means "leave the current record unchanged".
   */
  mutateGoal<T>(
    goalId: string,
    mutator: (current: Goal) => { goal: Goal; result: T } | null,
  ): { before: Goal; goal: Goal; result: T } | null {
    const sanitizedId = sanitizeGoalId(goalId)
    if (!sanitizedId) return null
    return this.withGoalLock(sanitizedId, () => {
      const current = this.readGoalUnsafe(sanitizedId)
      if (!current) return null
      const mutation = mutator(clone(current))
      if (!mutation) return null
      const next = clone({ ...mutation.goal, id: sanitizedId })
      next.schedule.goalId = sanitizedId
      atomicWriteText(
        this.getGoalFilePath(sanitizedId),
        JSON.stringify(next, null, 2),
      )
      return {
        before: clone(current),
        goal: clone(next),
        result: mutation.result,
      }
    })
  }

  appendEvent(event: GoalEvent): void {
    const goalId = sanitizeGoalId(event.goalId)
    if (!goalId) throw new Error('Goal event is missing goalId.')
    this.withGoalLock(goalId, () => {
      const eventPath = this.getEventsFilePath(goalId)
      safeMkdir(dirname(eventPath))
      appendFileSync(eventPath, JSON.stringify(event) + '\n', {
        encoding: 'utf8',
        mode: 0o600,
      })
    })
  }

  listEvents(goalId: string): GoalEvent[] {
    const path = this.getEventsFilePath(goalId)
    if (!existsSync(path)) return []
    try {
      return readFileSync(path, 'utf8')
        .split(/\r?\n/)
        .filter(Boolean)
        .flatMap(line => {
          try {
            const event = parseGoalEvent(JSON.parse(line))
            return event ? [event] : []
          } catch {
            return []
          }
        })
    } catch {
      return []
    }
  }
}
