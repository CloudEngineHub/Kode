import { describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { GoalService } from '@kode/core/goals'

import { GoalScheduleRunner } from './goalScheduleRunner'
import type { DaemonSession } from '../ws/types'

function session(): DaemonSession {
  return {
    sessionId: 'session-1',
    cwd: '/workspace',
    clients: new Set(),
    messages: [],
    readFileTimestamps: {},
    responseState: {},
    toolPermissionContext: { mode: 'default' },
    activeAbortController: null,
    turnInFlight: false,
    inflightPermissionRequests: new Map(),
  } as DaemonSession
}

describe('GoalScheduleRunner', () => {
  test('claims and dispatches due work only for eligible connected sessions', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'kode-goal-schedule-runner-'))
    try {
      const service = new GoalService({
        rootDir,
        clock: { now: () => 1_000 },
      })
      service.createGoal({
        cwd: '/workspace',
        sessionId: 'session-1',
        objective: 'Check CI',
        schedule: {
          kind: 'interval',
          prompt: 'Check CI and report changes.',
          everyMs: 60_000,
          anchorAt: 1_000,
        },
      })
      const delivered: string[] = []
      const runner = new GoalScheduleRunner({
        service,
        listSessions: () => [session()],
        canDispatch: () => true,
        dispatch: async ({ schedule }) => {
          delivered.push(schedule.prompt)
        },
      })

      await runner.tick()
      await runner.tick()
      expect(delivered).toEqual(['Check CI and report changes.'])
    } finally {
      rmSync(rootDir, { recursive: true, force: true })
    }
  })

  test('returns a failed one-off dispatch to a paused review state', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'kode-goal-schedule-failure-'))
    try {
      const service = new GoalService({
        rootDir,
        clock: { now: () => 1_000 },
      })
      const goal = service.createGoal({
        cwd: '/workspace',
        sessionId: 'session-1',
        objective: 'One-off task',
        schedule: { kind: 'once', prompt: 'Do work', runAt: 1_000 },
      })
      const runner = new GoalScheduleRunner({
        service,
        listSessions: () => [session()],
        canDispatch: () => true,
        dispatch: async () => {
          throw new Error('transport offline')
        },
      })

      await runner.tick()
      expect(service.getGoal(goal.id)).toMatchObject({ status: 'paused' })
    } finally {
      rmSync(rootDir, { recursive: true, force: true })
    }
  })
})
