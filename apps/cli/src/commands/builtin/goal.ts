import type { Command } from '../types'

import { GoalService, startGoal, type Goal, type GoalStatus } from '#core/goals'
import { getCwd } from '#core/utils/state'
import { getKodeAgentSessionId } from '#protocol/utils/kodeAgentSessionId'

const USAGE =
  'Usage: /goal [start] <objective> | /goal status [goal-id] | /goal cancel <goal-id> | /goal resume <goal-id> | /goal list'

function formatTimestamp(value: number | null | undefined): string {
  if (typeof value !== 'number') return '—'
  return new Date(value).toISOString()
}

function formatSchedule(goal: Goal): string {
  const schedule = goal.schedule
  if (schedule.kind === 'once') {
    return `once at ${formatTimestamp(schedule.runAt)}`
  }
  return `every ${schedule.everyMs}ms (next ${formatTimestamp(schedule.nextRunAt)})`
}

export function formatGoalStatus(goal: Goal): string {
  const lines = [
    `Goal ${goal.id}`,
    `Status: ${goal.status}`,
    `Objective: ${goal.objective}`,
    `Schedule: ${formatSchedule(goal)}`,
    `Prompt: ${goal.schedule.prompt}`,
    `Session: ${goal.sessionId}`,
    `Updated: ${formatTimestamp(goal.updatedAt)}`,
  ]
  if (goal.acceptanceCriteria.length > 0) {
    lines.push(`Acceptance: ${goal.acceptanceCriteria.join('; ')}`)
  }
  if (goal.pausedReason) lines.push(`Reason: ${goal.pausedReason}`)
  if (goal.lastError) lines.push(`Last error: ${goal.lastError.message}`)
  return lines.join('\n')
}

function currentScope(): { cwd: string; sessionId: string } {
  return { cwd: getCwd(), sessionId: getKodeAgentSessionId() }
}

function sessionGoals(service: GoalService): Goal[] {
  const { cwd, sessionId } = currentScope()
  return service
    .listGoals()
    .filter(goal => goal.cwd === cwd && goal.sessionId === sessionId)
    .sort((a, b) => b.updatedAt - a.updatedAt || b.revision - a.revision)
}

function findSessionGoal(service: GoalService, goalId: string): Goal | null {
  const goal = service.getGoal(goalId)
  if (!goal) return null
  const { cwd, sessionId } = currentScope()
  return goal.cwd === cwd && goal.sessionId === sessionId ? goal : null
}

function parseMaxIterations(raw: string): {
  objective: string
  maxIterations?: number
} {
  const match = raw.match(/(?:^|\s)--max-iterations\s+(\d+)(?=\s|$)/)
  if (!match?.[1]) return { objective: raw.trim() }
  const maxIterations = Number.parseInt(match[1], 10)
  const objective = raw.replace(match[0], ' ').trim()
  return {
    objective,
    ...(Number.isFinite(maxIterations) && maxIterations > 0
      ? { maxIterations }
      : {}),
  }
}

function commandError(error: unknown): string {
  return `Goal error: ${error instanceof Error ? error.message : String(error)}`
}

const goal = {
  type: 'local',
  name: 'goal',
  description:
    'Start, inspect, pause, resume, or cancel a durable session goal',
  argumentHint:
    '[start <objective> | status [id] | cancel <id> | resume <id> | list]',
  isEnabled: true,
  isHidden: false,
  aliases: ['goals'],
  async call(args) {
    const raw = args.trim()
    if (!raw) return USAGE
    const [verbRaw, ...rest] = raw.split(/\s+/)
    const verb = verbRaw?.toLowerCase() ?? ''

    try {
      if (verb === 'status') {
        const requestedId = rest[0]?.trim()
        const service = new GoalService()
        const goal = requestedId
          ? findSessionGoal(service, requestedId)
          : (service.findActiveGoal(currentScope()) ??
            sessionGoals(service)[0] ??
            null)
        return goal ? formatGoalStatus(goal) : 'No goal found for this session.'
      }

      if (verb === 'list') {
        const goals = sessionGoals(new GoalService())
        if (goals.length === 0) return 'No durable goals for this session.'
        return goals
          .map(goal => `${goal.id}  ${goal.status}  ${goal.objective}`)
          .join('\n')
      }

      if (verb === 'cancel' || verb === 'resume') {
        const goalId = rest[0]?.trim()
        if (!goalId) return `${USAGE}\nA goal ID is required for ${verb}.`
        const service = new GoalService()
        if (!findSessionGoal(service, goalId)) {
          return `Goal not found for this session: ${goalId}`
        }
        const updated =
          verb === 'cancel'
            ? service.cancelGoal(goalId, { reason: 'Cancelled with /goal.' })
            : service.resumeGoal(goalId, { reason: 'Resumed with /goal.' })
        if (!updated) return `Goal not found: ${goalId}`
        if (verb === 'resume') {
          const { cwd, sessionId } = currentScope()
          service.claimDueSchedules({
            cwd,
            sessionId,
            ownerId: `goal:${sessionId}`,
          })
        }
        return formatGoalStatus(service.getGoal(goalId) ?? updated)
      }

      const startArgs = verb === 'start' ? rest.join(' ') : raw
      const { objective, maxIterations } = parseMaxIterations(startArgs)
      if (!objective) return USAGE
      const { cwd, sessionId } = currentScope()
      const started = startGoal({
        cwd,
        sessionId,
        objective,
        ...(maxIterations ? { maxIterations } : {}),
      })
      return [
        `Goal started and is active for this session: ${started.id}`,
        `Objective: ${started.objective}`,
        `Max continuations: ${started.loop.maxIterations}`,
        'The next assistant final answer will be evaluated against this goal.',
      ].join('\n')
    } catch (error) {
      return commandError(error)
    }
  },
  userFacingName() {
    return 'goal'
  },
} satisfies Command

export type GoalCommandStatus = GoalStatus
export default goal
