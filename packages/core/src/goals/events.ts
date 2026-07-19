import { randomUUID } from 'node:crypto'

import type { Goal, GoalEvent, GoalEventType, GoalStatus } from './types'
import { GoalStorage } from './storage'

export function createGoalEvent(args: {
  goal: Goal
  type: GoalEventType
  at: number
  from?: GoalStatus
  to?: GoalStatus
  message?: string
  data?: Record<string, unknown>
}): GoalEvent {
  return {
    id: randomUUID(),
    goalId: args.goal.id,
    type: args.type,
    at: args.at,
    revision: args.goal.revision,
    ...(args.from ? { from: args.from } : {}),
    ...(args.to ? { to: args.to } : {}),
    ...(args.message?.trim() ? { message: args.message.trim() } : {}),
    ...(args.data ? { data: args.data } : {}),
  }
}

export function appendGoalEvent(
  storage: GoalStorage,
  args: Parameters<typeof createGoalEvent>[0],
): GoalEvent {
  const event = createGoalEvent(args)
  storage.appendEvent(event)
  return event
}
