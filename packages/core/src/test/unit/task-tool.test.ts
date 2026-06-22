import { describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { join } from 'path'
import { TaskTool } from '#tools/tools/ai/TaskTool/TaskTool'
import { applyAgentPermissionMode } from '#tools/tools/ai/TaskTool/permissions'
import { getBackgroundAgentTask } from '#core/utils/backgroundTasks'
import { createAssistantMessage } from '#core/utils/messages'
import { createAnthropicUsage } from '#core/utils/anthropic'
import { createDefaultToolPermissionContext } from '#core/types/toolPermissionContext'
import { FileReadTool } from '#tools/tools/filesystem/FileReadTool/FileReadTool'
import { FileWriteTool } from '#tools/tools/filesystem/FileWriteTool/FileWriteTool'
import { setCwd } from '#core/utils/state'
import {
  getKodeAgentSessionId,
  setKodeAgentSessionId,
} from '#protocol/utils/kodeAgentSessionId'
import { appendSessionJsonlFromMessage } from '#protocol/utils/kodeAgentSessionLog'
import { createUserMessage } from '#core/utils/messages'

describe('TaskTool', () => {
  test('subagent permission mode cannot auto-escalate beyond parent context', () => {
    const base = createDefaultToolPermissionContext({
      isBypassPermissionsModeAvailable: true,
    })
    base.mode = 'plan'

    const deniedEscalation = applyAgentPermissionMode(base, {
      agentPermissionMode: 'acceptEdits',
      safeMode: false,
    })
    expect(deniedEscalation?.mode).toBe('plan')

    const narrowed = applyAgentPermissionMode(base, {
      agentPermissionMode: 'dontAsk',
      safeMode: false,
    })
    expect(narrowed?.mode).toBe('dontAsk')
  })

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

  test('resume accepts disk transcript when in-memory cache is missing', async () => {
    const runnerCwd = process.cwd()
    const previousConfigDir = process.env.KODE_CONFIG_DIR
    const previousSessionId = getKodeAgentSessionId()

    const configDir = mkdtempSync(join(tmpdir(), 'kode-task-resume-config-'))
    const projectDir = mkdtempSync(join(tmpdir(), 'kode-task-resume-proj-'))
    process.env.KODE_CONFIG_DIR = configDir
    setKodeAgentSessionId('11111111-1111-4111-8111-111111111111')

    try {
      await setCwd(projectDir)

      const agentId = 'agent-resume-test'
      appendSessionJsonlFromMessage({
        cwd: projectDir,
        message: createUserMessage('hello from disk'),
        toolUseContext: { agentId },
      })

      const validate = await TaskTool.validateInput?.({
        description: 'resume task',
        prompt: 'do thing',
        subagent_type: 'general-purpose',
        resume: agentId,
      })
      expect(validate).toEqual({ result: true })

      async function* stubQuery() {
        yield createAssistantMessage('ok')
      }

      const gen = TaskTool.call(
        {
          description: 'resume run',
          prompt: 'resume prompt',
          subagent_type: 'general-purpose',
          resume: agentId,
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

      let sawResult = false
      for await (const chunk of gen) {
        if (chunk.type === 'result') {
          sawResult = true
          break
        }
      }
      expect(sawResult).toBe(true)
    } finally {
      await setCwd(runnerCwd)
      setKodeAgentSessionId(previousSessionId)
      if (previousConfigDir === undefined) {
        delete process.env.KODE_CONFIG_DIR
      } else {
        process.env.KODE_CONFIG_DIR = previousConfigDir
      }
      rmSync(configDir, { recursive: true, force: true })
      rmSync(projectDir, { recursive: true, force: true })
    }
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
      msg.message.usage = createAnthropicUsage({
        input_tokens: 10,
        output_tokens: 20,
        cache_creation_input_tokens: 3,
        cache_read_input_tokens: 2,
      })
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
    expect(result.data.usage).toMatchObject({
      input_tokens: 10,
      output_tokens: 20,
      cache_creation_input_tokens: 3,
      cache_read_input_tokens: 2,
    })
    expect(result.data.content).toEqual([
      { type: 'text', text: 'hello', citations: [] },
    ])
  })

  test('subagent inherits toolPermissionContext + commandAllowedTools (no silent widening)', async () => {
    let capturedOptions: any = null
    let readPermission: any = null
    let writePermission: any = null

    async function* stubQuery(
      _messages: any,
      _systemPrompt: any,
      _context: any,
      canUseTool: any,
      toolUseContext: any,
    ) {
      capturedOptions = toolUseContext?.options ?? null

      const filePath = join(homedir(), 'some-file.txt')
      const assistantMsg = createAssistantMessage('')

      readPermission = await canUseTool(
        FileReadTool,
        { file_path: filePath },
        toolUseContext,
        assistantMsg,
      )
      writePermission = await canUseTool(
        FileWriteTool,
        { file_path: filePath, content: 'x' },
        toolUseContext,
        assistantMsg,
      )

      yield createAssistantMessage('ok')
    }

    const toolPermissionContext = createDefaultToolPermissionContext({
      isBypassPermissionsModeAvailable: true,
    })
    toolPermissionContext.mode = 'dontAsk'

    const gen = TaskTool.call(
      {
        description: 'inheritance',
        prompt: 'inheritance prompt',
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
          toolPermissionContext,
          commandAllowedTools: ['Read(~/**)'],
        },
        __testQuery: stubQuery,
      },
    )

    for await (const _ of gen) {
      // exhaust
    }

    expect(capturedOptions?.toolPermissionContext?.mode).toBe('dontAsk')
    expect(capturedOptions?.commandAllowedTools).toEqual(['Read(~/**)'])

    expect(readPermission?.result).toBe(true)
    expect(writePermission?.result).toBe(false)
    expect(writePermission?.shouldPromptUser).toBe(false)
  })
})
