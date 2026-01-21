import { describe, expect, test } from 'bun:test'

import {
  __buildFlatLinesForTests,
  __flattenTasksTreeForTests,
  __getPreferredSelectedIndexForTests,
} from './TasksScreen'

describe('TasksScreen helpers', () => {
  test('renders a nested task tree with status + error hints', () => {
    const parentTask = {
      type: 'async_agent',
      agentId: 'agent-parent',
      description: 'Research the repo',
      prompt: 'do it',
      status: 'running',
      startedAt: 1,
      messages: [],
    }

    const childTask = {
      type: 'async_agent',
      agentId: 'agent-child',
      parentAgentId: 'agent-parent',
      description: 'Subtask: permissions',
      prompt: 'do it',
      status: 'failed',
      startedAt: 2,
      error: 'Permission denied',
      messages: [],
    }

    const nodes = [
      {
        kind: 'group',
        id: 'main',
        label: 'main',
        status: 'running',
        children: [
          {
            kind: 'agent',
            task: parentTask,
            children: [{ kind: 'agent', task: childTask, children: [] }],
          },
        ],
      },
    ] as any

    const flat = __flattenTasksTreeForTests({ nodes, collapsedIds: new Set() })
    const lines = __buildFlatLinesForTests({
      items: flat as any,
      selectedIndex: -1,
      collapsedIds: new Set(),
      maxWidth: 240,
    }).map(row => row.text)

    expect(lines).toEqual([
      '▾ ● main (running)',
      '  ▾ ● Research the repo',
      '      ✗ Subtask: permissions — Permission denied',
    ])
  })

  test('collapse hides children and switches caret', () => {
    const parentTask = {
      type: 'async_agent',
      agentId: 'agent-parent',
      description: 'Parent',
      prompt: 'do it',
      status: 'running',
      startedAt: 1,
      messages: [],
    }

    const childTask = {
      type: 'async_agent',
      agentId: 'agent-child',
      parentAgentId: 'agent-parent',
      description: 'Child',
      prompt: 'do it',
      status: 'completed',
      startedAt: 2,
      messages: [],
    }

    const nodes = [
      {
        kind: 'group',
        id: 'main',
        label: 'main',
        status: 'running',
        children: [
          {
            kind: 'agent',
            task: parentTask,
            children: [{ kind: 'agent', task: childTask, children: [] }],
          },
        ],
      },
    ] as any

    const collapsed = new Set(['agent-parent'])
    const flat = __flattenTasksTreeForTests({ nodes, collapsedIds: collapsed })
    const lines = __buildFlatLinesForTests({
      items: flat as any,
      selectedIndex: -1,
      collapsedIds: collapsed,
      maxWidth: 240,
    }).map(row => row.text)

    expect(lines).toEqual(['▾ ● main (running)', '  ▸ ● Parent'])
  })

  test('collapsing a group hides all descendants', () => {
    const task = {
      type: 'async_agent',
      agentId: 'agent-1',
      description: 'Task',
      prompt: 'do it',
      status: 'running',
      startedAt: 1,
      messages: [],
    }

    const nodes = [
      {
        kind: 'group',
        id: 'main',
        label: 'main',
        status: 'running',
        children: [{ kind: 'agent', task, children: [] }],
      },
    ] as any

    const collapsed = new Set(['main'])
    const flat = __flattenTasksTreeForTests({ nodes, collapsedIds: collapsed })
    const lines = __buildFlatLinesForTests({
      items: flat as any,
      selectedIndex: -1,
      collapsedIds: collapsed,
      maxWidth: 240,
    }).map(row => row.text)

    expect(lines).toEqual(['▸ ● main (running)'])
  })

  test('prefers leaf details when there is only one task', () => {
    const task = {
      type: 'async_agent',
      agentId: 'agent-1',
      description: 'Only task',
      prompt: 'do it',
      status: 'running',
      startedAt: 1,
      messages: [],
    }

    const nodes = [
      {
        kind: 'group',
        id: 'main',
        label: 'main',
        status: 'running',
        children: [{ kind: 'agent', task, children: [] }],
      },
    ] as any

    const flat = __flattenTasksTreeForTests({ nodes, collapsedIds: new Set() })
    expect(
      __getPreferredSelectedIndexForTests({
        items: flat as any,
        currentIndex: 0,
      }),
    ).toBe(1)
  })

  test('prefers the only running task when multiple tasks exist', () => {
    const completed = {
      type: 'async_agent',
      agentId: 'agent-completed',
      description: 'Completed',
      prompt: 'do it',
      status: 'completed',
      startedAt: 1,
      messages: [],
    }

    const running = {
      type: 'async_agent',
      agentId: 'agent-running',
      description: 'Running',
      prompt: 'do it',
      status: 'running',
      startedAt: 2,
      messages: [],
    }

    const nodes = [
      {
        kind: 'group',
        id: 'main',
        label: 'main',
        status: 'running',
        children: [
          { kind: 'agent', task: completed, children: [] },
          { kind: 'agent', task: running, children: [] },
        ],
      },
    ] as any

    const flat = __flattenTasksTreeForTests({ nodes, collapsedIds: new Set() })
    expect(
      __getPreferredSelectedIndexForTests({
        items: flat as any,
        currentIndex: 0,
      }),
    ).toBe(2)
  })
})
