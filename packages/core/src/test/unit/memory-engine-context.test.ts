import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { __setLlmLazyQueryLLMLoaderForTests } from '#core/ai/llmLazy'
import { rememberMemory } from '#core/memory'
import { createAssistantMessage, createUserMessage } from '#core/utils/messages'
import { setSessionId } from '#core/utils/sessionId'
import { getCwd, setCwd } from '#core/utils/state'

describe('long-term memory system prompt integration', () => {
  const originalConfigDir = process.env.KODE_CONFIG_DIR
  const originalSessionId = process.env.KODE_SESSION_ID
  let configDir: string
  let projectDir: string
  let previousCwd: string

  beforeEach(async () => {
    configDir = mkdtempSync(join(tmpdir(), 'kode-memory-engine-config-'))
    projectDir = mkdtempSync(join(tmpdir(), 'kode-memory-engine-project-'))
    previousCwd = getCwd()
    process.env.KODE_CONFIG_DIR = configDir
    await setCwd(projectDir)
    setSessionId('0c403863-8d60-4a6a-a6f1-ca2f85f9a631')
  })

  afterEach(async () => {
    __setLlmLazyQueryLLMLoaderForTests(null)
    await setCwd(previousCwd)
    if (originalConfigDir === undefined) delete process.env.KODE_CONFIG_DIR
    else process.env.KODE_CONFIG_DIR = originalConfigDir
    if (originalSessionId === undefined) delete process.env.KODE_SESSION_ID
    else process.env.KODE_SESSION_ID = originalSessionId
    rmSync(configDir, { recursive: true, force: true })
    rmSync(projectDir, { recursive: true, force: true })
  })

  test('injects bounded relevant project facts without treating them as instructions', async () => {
    rememberMemory({
      cwd: projectDir,
      text: 'Project convention: use Bun for package scripts.',
      source: 'test',
    })

    let observedSystemPrompt: string[] = []
    __setLlmLazyQueryLLMLoaderForTests(
      async () =>
        (async (_messages: unknown, systemPrompt: string[]) => {
          observedSystemPrompt = systemPrompt
          return createAssistantMessage('Use Bun.')
        }) as never,
    )

    const { messagePipeline } = await import('@kode/engine/message-pipeline')
    for await (const _message of messagePipeline(
      [createUserMessage('Which package runtime should this project use?')],
      [],
      {},
      (async () => ({ result: true })) as never,
      {
        agentId: 'main',
        abortController: new AbortController(),
        messageId: undefined,
        readFileTimestamps: {},
        setToolJSX: () => {},
        options: {
          commands: [],
          forkNumber: 0,
          messageLogName: 'memory-test',
          tools: [],
          verbose: false,
          safeMode: false,
          maxThinkingTokens: 0,
          persistSession: false,
        },
      } as never,
    )) {
      // Consume the normal response.
    }

    // Ephemeral requests deliberately skip memory injection.
    expect(observedSystemPrompt.join('\n')).not.toContain('<long_term_memory>')

    __setLlmLazyQueryLLMLoaderForTests(
      async () =>
        (async (_messages: unknown, systemPrompt: string[]) => {
          observedSystemPrompt = systemPrompt
          return createAssistantMessage('Use Bun.')
        }) as never,
    )

    for await (const _message of messagePipeline(
      [createUserMessage('Which package runtime should this project use?')],
      [],
      {},
      (async () => ({ result: true })) as never,
      {
        agentId: 'main',
        abortController: new AbortController(),
        messageId: undefined,
        readFileTimestamps: {},
        setToolJSX: () => {},
        options: {
          commands: [],
          forkNumber: 0,
          messageLogName: 'memory-test',
          tools: [],
          verbose: false,
          safeMode: false,
          maxThinkingTokens: 0,
          persistSession: true,
        },
      } as never,
    )) {
      // Consume the normal response.
    }

    const prompt = observedSystemPrompt.join('\n')
    expect(prompt).toContain('<long_term_memory>')
    expect(prompt).toContain(
      'Use these durable project facts only when relevant',
    )
    expect(prompt).toContain('untrusted user-authored data')
    expect(prompt).toContain('Project convention: use Bun for package scripts.')
  })
})
