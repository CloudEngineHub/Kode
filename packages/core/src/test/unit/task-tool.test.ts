import { describe, expect, test } from 'bun:test'
import { TaskTool } from '#tools/tools/ai/TaskTool/TaskTool'
import { getBackgroundAgentTask } from '#core/utils/backgroundTasks'
import { createAssistantMessage } from '#core/utils/messages'

describe('TaskTool', () => {
  test('inputSchema ignores unknown keys (compatibility)', () => {
    const result = TaskTool.inputSchema.safeParse({
      description: 'Explore project structure',
      prompt: 'Explore the repo',
      subagent_type: 'general-purpose',
      thoroughness: 'very thorough',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect('thoroughness' in result.data).toBe(false)
    }
  })

  test('validateInput: resume missing transcript rejects with reference wording', async () => {
    const result = await TaskTool.validateInput?.({
      description: 'resume task',
      prompt: 'do thing',
      subagent_type: 'general-purpose',
      resume: 'missing-agent-id',
    })

    expect(result).toEqual({
      result: false,
      message: 'No transcript found for agent ID: missing-agent-id',
      meta: { resume: 'missing-agent-id' },
    })
  })

  test('run_in_background returns agentId', async () => {
    async function* stubQuery() {
      yield createAssistantMessage('ok')
    }

    const gen = TaskTool.call(
      {
        description: 'bg',
        prompt: 'bg prompt',
        subagent_type: 'general-purpose',
        run_in_background: true,
      },
      {
        abortController: new AbortController(),
        readFileTimestamps: {},
        messageId: 'm',
        options: {
          safeMode: false,
          forkNumber: 0,
          messageLogName: 'task-tool-test',
          verbose: false,
          model: 'main',
          mcpClients: [],
        },
        __testQuery: stubQuery,
      },
    )

    const first = await gen.next()
    expect(first.done).toBe(false)
    if (first.done || !first.value) {
      throw new Error('Expected TaskTool to yield a result')
    }
    expect(first.value.type).toBe('result')
    if (first.value.type !== 'result') {
      throw new Error('Expected TaskTool to yield a result')
    }
    expect(first.value.data.status).toBe('async_launched')
    expect(typeof first.value.data.agentId).toBe('string')
    expect(first.value.data.agentId.length).toBeGreaterThan(0)

    const task = getBackgroundAgentTask(first.value.data.agentId)
    expect(task?.type).toBe('async_agent')
    await task?.done
  })

  test('completed output includes tool use count, duration, and tokens', async () => {
    async function* stubQuery() {
      const msg = createAssistantMessage('hello')
      msg.message.usage = {
        input_tokens: 10,
        output_tokens: 20,
        cache_creation_input_tokens: 3,
        cache_read_input_tokens: 2,
      }
      msg.message.content = [
        { type: 'tool_use', id: 't1', name: 'Bash', input: {} },
        { type: 'tool_use', id: 't2', name: 'Read', input: {} },
        { type: 'text', text: 'hello', citations: [] },
      ]
      yield msg
    }

    const gen = TaskTool.call(
      {
        description: 'fg',
        prompt: 'fg prompt',
        subagent_type: 'general-purpose',
      },
      {
        abortController: new AbortController(),
        readFileTimestamps: {},
        messageId: 'm',
        options: {
          safeMode: false,
          forkNumber: 0,
          messageLogName: 'task-tool-test',
          verbose: false,
          model: 'main',
          mcpClients: [],
        },
        __testQuery: stubQuery,
      },
    )

    let result: any = null
    for await (const chunk of gen) {
      if (chunk.type === 'result') {
        result = chunk
      }
    }

    expect(result?.data?.status).toBe('completed')
    expect(result.data.prompt).toBe('fg prompt')
    expect(result.data.totalToolUseCount).toBe(2)
    expect(result.data.totalTokens).toBe(35)
    expect(result.data.totalDurationMs).toBeGreaterThanOrEqual(0)
    expect(result.data.usage).toEqual({
      input_tokens: 10,
      output_tokens: 20,
      cache_creation_input_tokens: 3,
      cache_read_input_tokens: 2,
    })
    expect(result.data.content).toEqual([
      { type: 'text', text: 'hello', citations: [] },
    ])
  })
})
