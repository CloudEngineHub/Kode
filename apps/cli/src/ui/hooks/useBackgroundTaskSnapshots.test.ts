import { describe, expect, test } from 'bun:test'
import { __backgroundTaskSnapshotStoreForTests } from './useBackgroundTaskSnapshots'
import type { BackgroundTaskSnapshot } from '#core/tasks/backgroundRegistry'

function task(
  status: BackgroundTaskSnapshot['status'],
): BackgroundTaskSnapshot {
  return {
    taskId: 'agent-1',
    taskType: 'local_agent',
    status,
    description: 'Run agent',
    outputFile: '/tmp/agent-1.log',
    startedAt: 1_000,
    completedAt: status === 'completed' ? 2_000 : undefined,
    prompt: 'do it',
  } as BackgroundTaskSnapshot
}

describe('background task snapshot store helpers', () => {
  test('changes signature each tick while tasks are active', () => {
    const first = __backgroundTaskSnapshotStoreForTests.buildSnapshotSignature(
      [task('running')],
      1_000,
    )
    const second = __backgroundTaskSnapshotStoreForTests.buildSnapshotSignature(
      [task('running')],
      2_000,
    )

    expect(first).not.toBe(second)
  })

  test('keeps completed task signatures stable across ticks', () => {
    const first = __backgroundTaskSnapshotStoreForTests.buildSnapshotSignature(
      [task('completed')],
      1_000,
    )
    const second = __backgroundTaskSnapshotStoreForTests.buildSnapshotSignature(
      [task('completed')],
      2_000,
    )

    expect(first).toBe(second)
  })
})
