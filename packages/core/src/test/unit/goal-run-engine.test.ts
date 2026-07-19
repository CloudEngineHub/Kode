import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  __setLlmLazyQueryLLMLoaderForTests,
  __setLlmLazyQueryQuickLoaderForTests,
} from '#core/ai/llmLazy'
import { GoalService, startGoal } from '#core/goals'
import { createAssistantMessage, createUserMessage } from '#core/utils/messages'
import { setSessionId } from '#core/utils/sessionId'
import { getCwd, setCwd } from '#core/utils/state'

describe('GoalRun engine loop', () => {
  const originalConfigDir = process.env.KODE_CONFIG_DIR
  const originalSessionId = process.env.KODE_SESSION_ID
  const originalCwd = process.cwd()
  let configDir: string
  let projectDir: string

  beforeEach(async () => {
    configDir = mkdtempSync(join(tmpdir(), 'kode-goal-engine-config-'))
    projectDir = mkdtempSync(join(tmpdir(), 'kode-goal-engine-project-'))
    process.env.KODE_CONFIG_DIR = configDir
    await setCwd(projectDir)
    setSessionId('7e9b6c51-f441-4bb7-8ccc-92adfe45c3fd')
  })

  afterEach(async () => {
    __setLlmLazyQueryLLMLoaderForTests(null)
    __setLlmLazyQueryQuickLoaderForTests(null)
    await setCwd(originalCwd)
    if (originalConfigDir === undefined) delete process.env.KODE_CONFIG_DIR
    else process.env.KODE_CONFIG_DIR = originalConfigDir
    if (originalSessionId === undefined) delete process.env.KODE_SESSION_ID
    else process.env.KODE_SESSION_ID = originalSessionId
    rmSync(configDir, { recursive: true, force: true })
    rmSync(projectDir, { recursive: true, force: true })
  })

  test('continues a goal after a rejected final answer, then records completion', async () => {
    const sessionId = '7e9b6c51-f441-4bb7-8ccc-92adfe45c3fd'
    startGoal({
      cwd: projectDir,
      sessionId,
      objective: 'Create the goal-loop proof',
      acceptanceCriteria: ['Return a final response with concrete evidence'],
      maxIterations: 3,
    })

    let modelCalls = 0
    let evaluatorCalls = 0
    __setLlmLazyQueryLLMLoaderForTests(
      async () =>
        (async () => {
          modelCalls += 1
          return createAssistantMessage(
            modelCalls === 1
              ? 'I am done.'
              : 'Implemented the proof and verified it.',
          )
        }) as never,
    )
    __setLlmLazyQueryQuickLoaderForTests(
      async () =>
        (async () => {
          evaluatorCalls += 1
          return createAssistantMessage(
            evaluatorCalls === 1
              ? JSON.stringify({
                  action: 'continue',
                  reason: 'The first answer provides no evidence.',
                  continuationPrompt: 'Implement the proof and verify it.',
                })
              : JSON.stringify({
                  action: 'complete',
                  reason: 'The final response contains the required evidence.',
                }),
          )
        }) as never,
    )

    const { messagePipeline } = await import('@kode/engine/message-pipeline')
    const messages: Array<{ type: string; message?: unknown }> = []
    for await (const message of messagePipeline(
      [createUserMessage('Work on the proof.')],
      [],
      {},
      (async () => ({ result: true })) as never,
      {
        agentId: 'main',
        abortController: new AbortController(),
        messageId: undefined,
        readFileTimestamps: {},
        setToolJSX: () => {},
        turnCount: 0,
        options: {
          commands: [],
          forkNumber: 0,
          messageLogName: 'goal-test',
          tools: [],
          verbose: false,
          safeMode: false,
          maxThinkingTokens: 0,
          maxTurns: 10,
          persistSession: false,
        },
      } as never,
    )) {
      messages.push(message)
    }

    expect(modelCalls).toBe(2)
    expect(evaluatorCalls).toBe(2)
    expect(
      messages
        .filter(message => message.type === 'assistant')
        .map(message => {
          const content = (message as any).message?.content
          return Array.isArray(content) ? content[0]?.text : ''
        }),
    ).toEqual(['I am done.', 'Implemented the proof and verified it.'])

    const goals = new GoalService().listGoals()
    expect(goals).toHaveLength(1)
    expect(goals[0]?.status).toBe('completed')
    expect(getCwd()).toBe(projectDir)
  })
})
