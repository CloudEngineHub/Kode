import { describe, expect, test } from 'bun:test'

import { TaskTool } from '#tools/tools/ai/TaskTool/TaskTool'
import { getBackgroundAgentTask } from '#core/utils/backgroundTasks'
import { createAssistantMessage } from '#core/utils/messages'

describe('TaskTool ctrl+b backgrounding parity', () => {
  test('can be backgrounded via the ctrl+b overlay callback', async () => {
    async function* stubQuery() {
      yield createAssistantMessage('working')
      await new Promise(resolve => setTimeout(resolve, 2500))
      yield createAssistantMessage('done')
    }

    let triggered = false

    const events: any[] = []
    for await (const ev of TaskTool.call(
      {
        description: 'bg via ctrl+b',
        prompt: 'do it',
        subagent_type: 'general-purpose',
      },
      {
        abortController: new AbortController(),
        readFileTimestamps: {},
        messageId: 'm',
        options: {
          safeMode: false,
          forkNumber: 0,
          messageLogName: 'task-tool-ctrl-b-test',
          verbose: false,
          model: 'main',
          mcpClients: [],
        },
        __testQuery: stubQuery,
        setToolJSX: (value: any) => {
          if (triggered) return
          if (!value || !value.jsx) return
          const jsx: any = value.jsx
          const onBackground = jsx?.props?.onBackground
          if (typeof onBackground !== 'function') return
          triggered = true
          setTimeout(() => onBackground(), 0)
        },
      } as any,
    )) {
      events.push(ev)
    }

    expect(triggered).toBe(true)

    const result = events.find(e => e.type === 'result')
    expect(result).toBeTruthy()
    expect(result.data.status).toBe('async_launched')

    const agentId = result.data.agentId as string
    const task = getBackgroundAgentTask(agentId)
    expect(task).toBeTruthy()
    await task?.done
    expect(task?.status).not.toBe('running')
  })
})
