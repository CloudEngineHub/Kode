import {
  GoalScheduler,
  GoalService,
  type ClaimedSchedule,
} from '@kode/core/goals'

import type { DaemonSession } from '../ws/types'

export type GoalScheduleRunnerOptions = {
  listSessions: () => Iterable<DaemonSession>
  canDispatch: (session: DaemonSession) => boolean
  dispatch: (args: {
    session: DaemonSession
    schedule: ClaimedSchedule
  }) => Promise<void>
  service?: GoalService
  scheduler?: GoalScheduler
  pollIntervalMs?: number
  onError?: (error: unknown) => void
}

const DEFAULT_POLL_INTERVAL_MS = 1_000

/**
 * Bridges durable schedule claims to an already-connected daemon session.
 * It never invents an offline session or bypasses the normal tool-permission
 * path: hosts decide whether a session is eligible before a schedule is claimed.
 */
export class GoalScheduleRunner {
  private readonly service: GoalService
  private readonly scheduler: GoalScheduler
  private readonly pollIntervalMs: number
  private timer: ReturnType<typeof setInterval> | null = null
  private ticking = false

  constructor(private readonly options: GoalScheduleRunnerOptions) {
    this.service = options.service ?? new GoalService()
    this.scheduler = options.scheduler ?? new GoalScheduler(this.service)
    const configured = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
    this.pollIntervalMs = Number.isFinite(configured)
      ? Math.max(100, Math.floor(configured))
      : DEFAULT_POLL_INTERVAL_MS
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      void this.tick()
    }, this.pollIntervalMs)
    this.timer.unref?.()
    void this.tick()
  }

  stop(): void {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = null
  }

  async tick(): Promise<void> {
    if (this.ticking) return
    this.ticking = true
    try {
      for (const session of this.options.listSessions()) {
        if (!this.options.canDispatch(session)) continue
        const schedules = this.scheduler.tick({
          cwd: session.cwd,
          sessionId: session.sessionId,
          limit: 1,
        })
        for (const schedule of schedules) {
          try {
            await this.options.dispatch({ session, schedule })
          } catch (error) {
            // Do not leave a claimed run silently stuck. Interval schedules are
            // released to their next cadence; one-off runs pause for review.
            this.service.releaseAfterTurn(schedule.goalId, {
              runId: schedule.runId,
              reason: `Scheduled dispatch failed: ${
                error instanceof Error ? error.message : String(error)
              }`,
            })
            this.options.onError?.(error)
          }
        }
      }
    } finally {
      this.ticking = false
    }
  }
}
