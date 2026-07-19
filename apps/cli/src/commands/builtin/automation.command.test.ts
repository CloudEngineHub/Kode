import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { GoalService, type Clock } from '#core/goals'
import {
  getCwd,
  getOriginalCwd,
  setCwd,
  setOriginalCwd,
} from '#core/utils/state'
import {
  resetKodeAgentSessionIdForTests,
  setKodeAgentSessionId,
} from '#protocol/utils/kodeAgentSessionId'

import automation, { formatAutomationEvent } from './automation'

class FixedClock implements Clock {
  now(): number {
    return 0
  }
}

describe('/automation', () => {
  const originalConfigDir = process.env.KODE_CONFIG_DIR
  const originalCwd = getCwd()
  const originalOriginalCwd = getOriginalCwd()
  let rootDir: string
  let workspace: string

  beforeEach(async () => {
    rootDir = mkdtempSync(join(tmpdir(), 'kode-automation-command-root-'))
    workspace = mkdtempSync(
      join(tmpdir(), 'kode-automation-command-workspace-'),
    )
    process.env.KODE_CONFIG_DIR = rootDir
    await setCwd(workspace)
    setOriginalCwd(workspace)
    setKodeAgentSessionId('automation-command-session')
  })

  afterEach(async () => {
    await setCwd(originalCwd)
    setOriginalCwd(originalOriginalCwd)
    resetKodeAgentSessionIdForTests()
    if (originalConfigDir === undefined) delete process.env.KODE_CONFIG_DIR
    else process.env.KODE_CONFIG_DIR = originalConfigDir
    rmSync(rootDir, { recursive: true, force: true })
    rmSync(workspace, { recursive: true, force: true })
  })

  test('recovers an expired GoalRun and exposes status plus its event trail', async () => {
    const service = new GoalService({
      clock: new FixedClock(),
      leaseDurationMs: 1_000,
    })
    const goal = service.createGoal({
      id: 'automation-recovery',
      cwd: workspace,
      sessionId: 'automation-command-session',
      objective: 'Recover an interrupted automation',
      schedule: { kind: 'once', prompt: 'Retry the automation.', runAt: 0 },
    })
    expect(
      service.claimDueSchedules({
        cwd: workspace,
        sessionId: 'automation-command-session',
        now: 0,
      }),
    ).toHaveLength(1)

    const recovered = await automation.call('recover')
    expect(recovered).toContain('Recovered 1 interrupted goal')
    expect(recovered).toContain(goal.id)

    const status = await automation.call('status')
    expect(status).toContain('Automation status (scheduled: 1)')
    expect(status).toContain(goal.id)

    const events = await automation.call(`events ${goal.id}`)
    expect(events).toContain('created')
    expect(events).toContain('claimed')
    expect(events).toContain('recovered')
  })

  test('formats event transitions and validates events arguments', async () => {
    expect(
      formatAutomationEvent({
        id: 'event-1',
        goalId: 'goal-1',
        type: 'paused',
        at: 0,
        revision: 3,
        from: 'running',
        to: 'paused',
        message: 'Needs approval',
      }),
    ).toContain('running→paused — Needs approval')
    expect(await automation.call('events')).toContain('goal ID is required')
    expect(await automation.call('unknown')).toContain('Usage: /automation')
  })

  test('recovers only expired GoalRuns owned by the current session', async () => {
    const service = new GoalService({
      clock: new FixedClock(),
      leaseDurationMs: 1_000,
    })
    const local = service.createGoal({
      id: 'local-expired-goal',
      cwd: workspace,
      sessionId: 'automation-command-session',
      objective: 'Recover only me',
      schedule: { kind: 'once', prompt: 'Recover local goal', runAt: 0 },
    })
    const foreign = service.createGoal({
      id: 'foreign-expired-goal',
      cwd: workspace,
      sessionId: 'other-session',
      objective: 'Do not disclose me',
      schedule: { kind: 'once', prompt: 'Recover foreign goal', runAt: 0 },
    })
    service.claimDueSchedules({
      cwd: workspace,
      sessionId: local.sessionId,
      now: 0,
    })
    service.claimDueSchedules({
      cwd: workspace,
      sessionId: foreign.sessionId,
      now: 0,
    })

    const recovered = await automation.call('recover')
    expect(recovered).toContain(local.id)
    expect(recovered).not.toContain(foreign.id)
    expect(service.getGoal(local.id)?.status).toBe('scheduled')
    expect(service.getGoal(foreign.id)?.status).toBe('running')
  })
})
