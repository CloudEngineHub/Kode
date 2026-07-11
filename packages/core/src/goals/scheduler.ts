import { GoalService } from './service'
import { type ClaimedSchedule, type ClaimDueSchedulesInput } from './types'

/**
 * Pure, durable schedule claim primitive. It deliberately does not execute an
 * LLM or submit messages: callers (REPL/daemon) take the returned prompt and
 * choose how to deliver it to the target session.
 */
export function claimDueSchedules(
  input: ClaimDueSchedulesInput,
): ClaimedSchedule[] {
  const service = new GoalService({
    rootDir: input.rootDir,
    clock: {
      now: () => (typeof input.now === 'number' ? input.now : Date.now()),
    },
    leaseDurationMs: input.leaseDurationMs,
  })
  const now = service.clock.now()
  // Recovery creates one retry slot for an interrupted run. It never rewinds
  // an interval, so a downtime cannot produce a catch-up burst.
  service.recoverInterruptedGoals({
    now,
    cwd: input.cwd,
    sessionId: input.sessionId,
  })
  return service.claimDueSchedules(input)
}

/**
 * Stateful convenience for pollers. `tick` is synchronous and single-flight;
 * a UI can safely call it from an interval without spawning work itself.
 */
export class GoalScheduler {
  private ticking = false

  constructor(private readonly service: GoalService = new GoalService()) {}

  tick(input: Omit<ClaimDueSchedulesInput, 'rootDir'>): ClaimedSchedule[] {
    if (this.ticking) return []
    this.ticking = true
    try {
      const now =
        typeof input.now === 'number' ? input.now : this.service.clock.now()
      this.service.recoverInterruptedGoals({
        now,
        cwd: input.cwd,
        sessionId: input.sessionId,
      })
      return this.service.claimDueSchedules({ ...input, now })
    } finally {
      this.ticking = false
    }
  }
}
