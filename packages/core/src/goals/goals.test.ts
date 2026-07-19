import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  GoalService,
  GoalStorage,
  claimDueSchedules,
  evaluateActiveGoalAfterTurn,
  getUnstartedGoalRunSchedule,
  startGoal,
  type Clock,
} from './index'

class TestClock implements Clock {
  constructor(public value: number) {}

  now(): number {
    return this.value
  }
}

const temporaryRoots: string[] = []

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'kode-goals-'))
  temporaryRoots.push(root)
  return root
}

function makeService(rootDir: string, clock: TestClock): GoalService {
  let nextId = 0
  return new GoalService({
    rootDir,
    clock,
    leaseDurationMs: 1_000,
    idFactory: () => `generated-${++nextId}`,
  })
}

afterEach(() => {
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop()!
    rmSync(root, { recursive: true, force: true })
  }
})

describe('durable goals', () => {
  test('persists a goal atomically at the KODE root and records events', () => {
    const root = makeRoot()
    const clock = new TestClock(1_000)
    const service = makeService(root, clock)
    const goal = service.createGoal({
      id: 'goal-persisted',
      cwd: join(root, 'workspace'),
      sessionId: 'session-a',
      objective: 'Ship a durable goal store',
      acceptanceCriteria: ['Goal can be loaded after a new process starts'],
      schedule: {
        kind: 'once',
        prompt: 'Implement the durable goal store.',
        runAt: 1_500,
      },
    })

    const restartedStore = new GoalStorage({ rootDir: root })
    const loaded = restartedStore.getGoal(goal.id)
    expect(loaded).not.toBeNull()
    expect(loaded?.objective).toBe(goal.objective)
    expect(loaded?.schedule.prompt).toBe('Implement the durable goal store.')
    expect(restartedStore.listEvents(goal.id)).toHaveLength(1)
    expect(restartedStore.listEvents(goal.id)[0]?.type).toBe('created')
  })

  test('claims a fixed interval once and skips all missed slots', () => {
    const root = makeRoot()
    const clock = new TestClock(1_350)
    const service = makeService(root, clock)
    const goal = service.createGoal({
      id: 'goal-interval',
      cwd: join(root, 'workspace'),
      sessionId: 'session-a',
      objective: 'Check CI until it is green',
      schedule: {
        kind: 'interval',
        prompt: 'Check CI and continue the active goal.',
        everyMs: 100,
        anchorAt: 1_000,
      },
    })

    const first = service.claimDueSchedules({
      cwd: goal.cwd,
      sessionId: goal.sessionId,
      now: clock.now(),
    })
    expect(first).toHaveLength(1)
    expect(first[0]?.prompt).toBe('Check CI and continue the active goal.')
    expect(service.getGoal(goal.id)?.schedule.nextRunAt).toBe(1_400)

    service.releaseAfterTurn(goal.id, {
      now: clock.now(),
      runId: service.getGoal(goal.id)?.activeRun?.id ?? '',
    })
    expect(
      service.claimDueSchedules({
        cwd: goal.cwd,
        sessionId: goal.sessionId,
        now: 1_399,
      }),
    ).toHaveLength(0)
    expect(
      service.claimDueSchedules({
        cwd: goal.cwd,
        sessionId: goal.sessionId,
        now: 1_400,
      }),
    ).toHaveLength(1)
  })

  test('consumes a one-off schedule exactly once unless an interrupted lease is recovered', () => {
    const root = makeRoot()
    const clock = new TestClock(1_000)
    const service = makeService(root, clock)
    const goal = service.createGoal({
      id: 'goal-once',
      cwd: join(root, 'workspace'),
      sessionId: 'session-a',
      objective: 'Run the one-off migration review',
      schedule: {
        kind: 'once',
        prompt: 'Review migration status.',
        runAt: 1_000,
      },
    })

    expect(
      service.claimDueSchedules({
        cwd: goal.cwd,
        sessionId: goal.sessionId,
        now: 1_000,
      }),
    ).toHaveLength(1)
    service.releaseAfterTurn(goal.id, {
      now: 1_001,
      runId: service.getGoal(goal.id)?.activeRun?.id ?? '',
    })
    expect(service.getGoal(goal.id)?.status).toBe('paused')
    expect(
      service.claimDueSchedules({
        cwd: goal.cwd,
        sessionId: goal.sessionId,
        now: 9_000,
      }),
    ).toHaveLength(0)
  })

  test('recovers an expired lease as one retry without duplicate claims', () => {
    const root = makeRoot()
    const clock = new TestClock(1_000)
    const service = makeService(root, clock)
    const goal = service.createGoal({
      id: 'goal-recovery',
      cwd: join(root, 'workspace'),
      sessionId: 'session-a',
      objective: 'Recover an interrupted run',
      schedule: {
        kind: 'once',
        prompt: 'Continue after recovery.',
        runAt: 1_000,
      },
    })

    expect(
      service.claimDueSchedules({
        cwd: goal.cwd,
        sessionId: goal.sessionId,
        now: 1_000,
      }),
    ).toHaveLength(1)
    const recovered = service.recoverInterruptedGoals({ now: 2_001 })
    expect(recovered.map(item => item.id)).toEqual([goal.id])
    expect(service.getGoal(goal.id)?.status).toBe('scheduled')

    expect(
      service.claimDueSchedules({
        cwd: goal.cwd,
        sessionId: goal.sessionId,
        now: 2_001,
      }),
    ).toHaveLength(1)
    expect(
      service.claimDueSchedules({
        cwd: goal.cwd,
        sessionId: goal.sessionId,
        now: 2_001,
      }),
    ).toHaveLength(0)
  })

  test('top-level scheduler claim is root-scoped, prompt-carrying, and atomic', () => {
    const root = makeRoot()
    const clock = new TestClock(5_000)
    const service = makeService(root, clock)
    const goal = service.createGoal({
      id: 'goal-scheduler',
      cwd: join(root, 'workspace'),
      sessionId: 'session-a',
      objective: 'Wake a session',
      schedule: {
        kind: 'once',
        prompt: 'Wake and inspect the goal.',
        runAt: 5_000,
      },
    })

    const first = claimDueSchedules({
      rootDir: root,
      cwd: goal.cwd,
      sessionId: goal.sessionId,
      now: 5_000,
      leaseDurationMs: 1_000,
    })
    expect(first).toHaveLength(1)
    expect(first[0]?.goalId).toBe(goal.id)
    expect(first[0]?.prompt).toBe('Wake and inspect the goal.')
    expect(
      claimDueSchedules({
        rootDir: root,
        cwd: goal.cwd,
        sessionId: goal.sessionId,
        now: 5_000,
      }),
    ).toHaveLength(0)
  })

  test('startGoal is immediately session-active and evaluator injection controls the loop', async () => {
    const root = makeRoot()
    const cwd = join(root, 'workspace')
    const goal = startGoal({
      rootDir: root,
      cwd,
      sessionId: 'session-goal',
      objective: 'Finish the release checklist',
      acceptanceCriteria: ['All checks are evidenced'],
      maxIterations: 2,
      now: 10_000,
    })
    expect(goal.status).toBe('running')

    const continued = await evaluateActiveGoalAfterTurn({
      rootDir: root,
      cwd,
      sessionId: 'session-goal',
      assistantText: 'I have started.',
      now: 10_001,
      evaluate: async () => ({
        action: 'continue',
        reason: 'Tests still need to run.',
        continuationPrompt: 'Run the focused tests and report their evidence.',
      }),
    })
    expect(continued.action).toBe('continue')
    expect(continued.continuationPrompt).toBe(
      'Run the focused tests and report their evidence.',
    )
    expect(continued.goal?.activeRun?.turnCount).toBe(1)

    const completed = await evaluateActiveGoalAfterTurn({
      rootDir: root,
      cwd,
      sessionId: 'session-goal',
      assistantText: 'Focused tests passed with evidence.',
      now: 10_002,
      evaluate: async () => ({
        action: 'complete',
        reason: 'All checks evidenced.',
      }),
    })
    expect(completed.action).toBe('complete')
    expect(completed.goal?.status).toBe('completed')
  })

  test('exposes an unstarted direct goal to an interactive dispatcher', () => {
    const root = makeRoot()
    const goal = startGoal({
      rootDir: root,
      cwd: join(root, 'workspace'),
      sessionId: 'session-dispatch',
      objective: 'Start the first goal turn',
      now: 10_000,
    })

    expect(getUnstartedGoalRunSchedule(goal)).toMatchObject({
      goalId: goal.id,
      prompt: 'Start the first goal turn',
      runId: goal.activeRun?.id,
    })

    const continued = new GoalService({ rootDir: root }).recordContinuation(
      goal.id,
      { runId: goal.activeRun?.id ?? '' },
    )
    expect(getUnstartedGoalRunSchedule(continued)).toBeNull()
  })

  test('fences a stale evaluator from completing a reclaimed GoalRun', async () => {
    const root = makeRoot()
    const cwd = join(root, 'workspace')
    const clock = new TestClock(1_000)
    const service = makeService(root, clock)
    const started = service.startGoal({
      cwd,
      sessionId: 'session-fence',
      objective: 'Keep the reclaimed run intact',
    })
    const oldRunId = started.activeRun?.id

    let resolveEvaluation!: (value: {
      action: 'complete'
      reason: string
    }) => void
    let markEvaluationStarted!: () => void
    const evaluationStarted = new Promise<void>(resolve => {
      markEvaluationStarted = resolve
    })
    const delayedDecision = new Promise<{ action: 'complete'; reason: string }>(
      resolve => {
        resolveEvaluation = resolve
      },
    )
    const evaluation = evaluateActiveGoalAfterTurn({
      rootDir: root,
      cwd,
      sessionId: 'session-fence',
      assistantText: 'The first run is still evaluating.',
      now: 1_000,
      leaseDurationMs: 1_000,
      evaluate: async () => {
        markEvaluationStarted()
        return delayedDecision
      },
    })
    await evaluationStarted

    expect(
      service.recoverInterruptedGoals({
        cwd,
        sessionId: 'session-fence',
        now: 2_001,
      }),
    ).toHaveLength(1)
    expect(
      service.claimDueSchedules({
        cwd,
        sessionId: 'session-fence',
        now: 2_001,
      }),
    ).toHaveLength(1)
    const reclaimed = service.getGoal(started.id)
    expect(reclaimed?.activeRun?.id).not.toBe(oldRunId)

    resolveEvaluation({ action: 'complete', reason: 'Old evaluator result.' })
    const outcome = await evaluation
    expect(outcome.action).toBe('none')
    expect(service.getGoal(started.id)?.status).toBe('running')
    expect(service.getGoal(started.id)?.activeRun?.id).toBe(
      reclaimed?.activeRun?.id,
    )
  })

  test('allows only one active GoalRun per workspace/session', () => {
    const root = makeRoot()
    const clock = new TestClock(1_000)
    const service = makeService(root, clock)
    const first = service.startGoal({
      cwd: join(root, 'workspace'),
      sessionId: 'session-single-active',
      objective: 'First active goal',
    })

    expect(() =>
      service.startGoal({
        cwd: first.cwd,
        sessionId: first.sessionId,
        objective: 'Second active goal',
      }),
    ).toThrow('An active goal already exists for this session')
    expect(
      service
        .listGoals()
        .filter(
          goal =>
            goal.status === 'running' && goal.sessionId === first.sessionId,
        ),
    ).toHaveLength(1)
  })

  test('rejects invalid state transitions instead of silently corrupting state', () => {
    const root = makeRoot()
    const service = makeService(root, new TestClock(1_000))
    const goal = service.createGoal({
      id: 'goal-transitions',
      cwd: join(root, 'workspace'),
      sessionId: 'session-a',
      objective: 'Protect the state machine',
      schedule: { kind: 'once', prompt: 'Do work.', runAt: 2_000 },
    })

    expect(() =>
      service.completeGoal(goal.id, { runId: 'not-running' }),
    ).toThrow('cannot transition from scheduled to completed')
  })
})
