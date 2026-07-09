import { describe, expect, test } from 'bun:test'
import { buildRunningTaskRowsForTests } from './RunningTasksPanel'
import type { BackgroundTaskSnapshot } from '#core/tasks/backgroundRegistry'

function agentTask(
  overrides: Partial<BackgroundTaskSnapshot> = {},
): BackgroundTaskSnapshot {
  return {
    taskId: 'agent-1',
    taskType: 'local_agent',
    status: 'running',
    description: 'Refactor task output visibility',
    outputFile: '/tmp/agent-1.log',
    startedAt: 1_000,
    prompt: 'do it',
    ...overrides,
  } as BackgroundTaskSnapshot
}

function shellTask(
  overrides: Partial<BackgroundTaskSnapshot> = {},
): BackgroundTaskSnapshot {
  return {
    taskId: 'shell-1',
    taskType: 'local_bash',
    status: 'running',
    description: 'bun test',
    command: 'bun test ./packages/core/src/test/unit/task-tool.test.ts',
    outputFile: '/tmp/shell-1.log',
    startedAt: 2_000,
    exitCode: null,
    stdoutLineCount: 0,
    stderrLineCount: 0,
    ...overrides,
  } as BackgroundTaskSnapshot
}

describe('RunningTasksPanel helpers', () => {
  test('builds compact rows for running agent and shell tasks', () => {
    const result = buildRunningTaskRowsForTests({
      tasks: [
        agentTask({
          taskId: 'completed-agent',
          status: 'completed',
          completedAt: 3_000,
        }),
        shellTask({ startedAt: 2_000 }),
        agentTask({ startedAt: 1_000, subagentType: 'reviewer' }),
      ],
      now: 62_000,
      maxWidth: 90,
    })

    expect(result.hiddenCount).toBe(0)
    expect(result.rows).toEqual([
      {
        key: 'agent-1',
        status: 'running',
        label: 'Agent reviewer: Refactor task output visibility',
        elapsed: '1m 1s',
      },
      {
        key: 'shell-1',
        status: 'running',
        label: 'Shell bun test ./packages/core/src/test/unit/task-tool.test.ts',
        elapsed: '1m 0s',
      },
    ])
  })

  test('limits visible rows and reports hidden active tasks', () => {
    const result = buildRunningTaskRowsForTests({
      tasks: [
        agentTask({ taskId: 'agent-1', startedAt: 1 }),
        agentTask({ taskId: 'agent-2', startedAt: 2 }),
        agentTask({ taskId: 'agent-3', startedAt: 3 }),
        agentTask({ taskId: 'agent-4', startedAt: 4 }),
      ],
      now: 5_000,
      maxWidth: 40,
    })

    expect(result.rows.map(row => row.key)).toEqual([
      'agent-1',
      'agent-2',
      'agent-3',
    ])
    expect(result.hiddenCount).toBe(1)
    expect(result.rows[0]?.label.length).toBeLessThanOrEqual(14)
  })
})
