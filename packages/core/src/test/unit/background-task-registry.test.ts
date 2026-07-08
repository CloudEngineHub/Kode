import { describe, expect, test } from 'bun:test'
import type { BackgroundProcess } from '#runtime/shell/types'
import type { BackgroundAgentTask } from '#core/utils/backgroundTasks'
import {
  __backgroundTaskRegistryForTests,
  getBackgroundShellStatus,
} from '#core/tasks/backgroundRegistry'
import { createAssistantMessage } from '#core/utils/messages'

function makeShellTask(
  overrides: Partial<BackgroundProcess> = {},
): BackgroundProcess {
  return {
    id: 'shell-1',
    command: 'bun test',
    stdout: '',
    stderr: '',
    stdoutCursor: 0,
    stderrCursor: 0,
    stdoutLineCount: 2,
    stderrLineCount: 1,
    lastReportedStdoutLines: 0,
    lastReportedStderrLines: 0,
    code: null,
    interrupted: false,
    killed: false,
    timedOut: false,
    completionStatusSentInAttachment: false,
    notified: false,
    startedAt: 100,
    timeoutAt: 1000,
    process: {} as BackgroundProcess['process'],
    abortController: new AbortController(),
    timeoutHandle: null,
    cwd: '/repo',
    outputFile: '/tmp/shell-1.output',
    ...overrides,
  }
}

function makeAgentTask(
  overrides: Partial<BackgroundAgentTask> = {},
): BackgroundAgentTask {
  return {
    type: 'async_agent',
    agentId: 'agent-1',
    parentAgentId: 'main',
    description: 'Refactor task output',
    prompt: 'do work',
    status: 'running',
    startedAt: 200,
    messages: [createAssistantMessage('started')],
    ...overrides,
  }
}

describe('background task registry', () => {
  test('normalizes shell task status', () => {
    expect(getBackgroundShellStatus(makeShellTask())).toBe('running')
    expect(getBackgroundShellStatus(makeShellTask({ code: 0 }))).toBe(
      'completed',
    )
    expect(getBackgroundShellStatus(makeShellTask({ code: 1 }))).toBe('failed')
    expect(getBackgroundShellStatus(makeShellTask({ killed: true }))).toBe(
      'killed',
    )
  })

  test('builds a shell task snapshot', () => {
    const snapshot =
      __backgroundTaskRegistryForTests.toShellTaskSnapshot(makeShellTask())

    expect(snapshot).toMatchObject({
      taskId: 'shell-1',
      taskType: 'local_bash',
      status: 'running',
      description: 'bun test',
      command: 'bun test',
      exitCode: null,
      stdoutLineCount: 2,
      stderrLineCount: 1,
      outputFile: '/tmp/shell-1.output',
    })
  })

  test('builds an agent task snapshot', () => {
    const snapshot = __backgroundTaskRegistryForTests.toAgentTaskSnapshot(
      makeAgentTask({
        status: 'completed',
        completedAt: 300,
        resultText: 'done',
      }),
    )

    expect(snapshot).toMatchObject({
      taskId: 'agent-1',
      taskType: 'local_agent',
      status: 'completed',
      description: 'Refactor task output',
      prompt: 'do work',
      parentTaskId: 'main',
      completedAt: 300,
      resultText: 'done',
    })
  })
})
