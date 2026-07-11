import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { GoalService } from '#core/goals'
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

import goal from './goal'

describe('/goal', () => {
  const originalConfigDir = process.env.KODE_CONFIG_DIR
  const originalCwd = getCwd()
  const originalOriginalCwd = getOriginalCwd()
  let rootDir: string
  let workspace: string

  beforeEach(async () => {
    rootDir = mkdtempSync(join(tmpdir(), 'kode-goal-command-root-'))
    workspace = mkdtempSync(join(tmpdir(), 'kode-goal-command-workspace-'))
    process.env.KODE_CONFIG_DIR = rootDir
    await setCwd(workspace)
    setOriginalCwd(workspace)
    setKodeAgentSessionId('goal-command-session')
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

  test('starts an immediately active session goal and reports status', async () => {
    const started = await goal.call('Ship the focused goal integration')
    expect(started).toContain('Goal started and is active for this session')

    const active = new GoalService().findActiveGoal({
      cwd: workspace,
      sessionId: 'goal-command-session',
    })
    expect(active?.status).toBe('running')
    expect(active?.objective).toBe('Ship the focused goal integration')

    const status = await goal.call('status')
    expect(status).toContain(`Goal ${active?.id}`)
    expect(status).toContain('Status: running')

    const list = await goal.call('list')
    expect(list).toContain(active?.id ?? '')
    expect(list).toContain('Ship the focused goal integration')
  })

  test('cancels a running goal and resumes a paused one', async () => {
    await goal.call('start Cancel this goal')
    const service = new GoalService()
    const active = service.findActiveGoal({
      cwd: workspace,
      sessionId: 'goal-command-session',
    })
    expect(active).not.toBeNull()

    const cancelled = await goal.call(`cancel ${active?.id}`)
    expect(cancelled).toContain('Status: cancelled')

    const paused = service.createGoal({
      id: 'paused-goal',
      cwd: workspace,
      sessionId: 'goal-command-session',
      objective: 'Resume this goal',
      schedule: {
        kind: 'once',
        prompt: 'Resume this goal.',
        runAt: Date.now() + 60_000,
      },
    })
    service.pauseGoal(paused.id, { reason: 'Waiting for user.' })

    const resumed = await goal.call(`resume ${paused.id}`)
    expect(resumed).toContain('Status: scheduled')
    expect(resumed).toContain('Resume this goal')
  })

  test('refuses a second active goal in the same session', async () => {
    await goal.call('start First active goal')
    const second = await goal.call('start Second active goal')

    expect(second).toContain('An active goal already exists for this session')
    expect(
      new GoalService()
        .listGoals()
        .filter(
          item =>
            item.sessionId === 'goal-command-session' &&
            item.status === 'running',
        ),
    ).toHaveLength(1)
  })

  test('returns concise usage for missing or malformed control arguments', async () => {
    expect(await goal.call('')).toContain('Usage: /goal')
    expect(await goal.call('cancel')).toContain('goal ID is required')
    expect(await goal.call('status unknown-goal')).toBe(
      'No goal found for this session.',
    )
  })
})
