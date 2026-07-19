import { describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { GoalService, evaluateActiveGoalAfterTurn } from '#core/goals'

describe('interval goal loops', () => {
  test('return to the next cadence without invoking the completion evaluator', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'kode-interval-loop-'))
    try {
      const service = new GoalService({ rootDir })
      const goal = service.createGoal({
        cwd: '/workspace',
        sessionId: 'session-1',
        objective: 'Poll CI state',
        schedule: {
          kind: 'interval',
          prompt: 'Check CI status and report changes.',
          everyMs: 60_000,
          anchorAt: 1_000,
        },
      })
      service.claimDueSchedules({
        cwd: '/workspace',
        sessionId: 'session-1',
        now: 1_000,
      })

      const outcome = await evaluateActiveGoalAfterTurn({
        cwd: '/workspace',
        sessionId: 'session-1',
        assistantText: 'No changes.',
        rootDir,
        now: 1_500,
        evaluate: async () => {
          throw new Error('An interval loop must not invoke the evaluator.')
        },
      })

      expect(outcome.action).toBe('none')
      expect(new GoalService({ rootDir }).getGoal(goal.id)).toMatchObject({
        status: 'scheduled',
        schedule: { nextRunAt: 61_000 },
      })
    } finally {
      rmSync(rootDir, { recursive: true, force: true })
    }
  })
})
