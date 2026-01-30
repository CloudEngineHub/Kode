import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createAssistantMessage, createUserMessage } from '#core/utils/messages'
import { checkMicroCompact } from '#core/utils/microCompactCore'
import {
  PERSISTED_OUTPUT_OPEN_TAG,
  PERSISTED_OUTPUT_CLOSE_TAG,
} from '#core/utils/toolResultPersistence'
import {
  resetKodeAgentSessionIdForTests,
  setKodeAgentSessionId,
} from '#protocol/utils/kodeAgentSessionId'
import { sanitizeProjectNameForSessionStore } from '#protocol/utils/kodeAgentSessionLog'
import { getOriginalCwd, setCwd, setOriginalCwd } from '#core/utils/state'

function assistantToolUseMessage(args: { id: string; name: string }) {
  const msg = createAssistantMessage('[tool_use]')
  return {
    ...msg,
    message: {
      ...msg.message,
      content: [
        {
          type: 'tool_use',
          id: args.id,
          name: args.name,
          input: {},
        },
      ],
    },
  }
}

function userToolResultMessage(args: { toolUseId: string; content: string }) {
  return createUserMessage([
    {
      type: 'tool_result',
      tool_use_id: args.toolUseId,
      content: args.content,
      is_error: false,
    },
  ])
}

describe('microcompact (tool result offload)', () => {
  const originalConfigDir = process.env.KODE_CONFIG_DIR
  const originalAnyKodeConfigDir = process.env.ANYKODE_CONFIG_DIR

  let configDir: string
  let projectDir: string
  let runnerOriginalCwd: string

  beforeEach(async () => {
    runnerOriginalCwd = getOriginalCwd()
    configDir = mkdtempSync(join(tmpdir(), 'kode-microcompact-config-'))
    projectDir = mkdtempSync(join(tmpdir(), 'kode-microcompact-project-'))
    process.env.KODE_CONFIG_DIR = configDir
    delete process.env.ANYKODE_CONFIG_DIR
    delete process.env.KODE_DISABLE_MICROCOMPACT
    setKodeAgentSessionId('704b907b-2b0f-478d-a7cb-b9fecf921913')
    await setCwd(projectDir)
    setOriginalCwd(projectDir)
  })

  afterEach(() => {
    resetKodeAgentSessionIdForTests()
    setOriginalCwd(runnerOriginalCwd)
    if (originalConfigDir === undefined) delete process.env.KODE_CONFIG_DIR
    else process.env.KODE_CONFIG_DIR = originalConfigDir

    if (originalAnyKodeConfigDir === undefined)
      delete process.env.ANYKODE_CONFIG_DIR
    else process.env.ANYKODE_CONFIG_DIR = originalAnyKodeConfigDir

    rmSync(configDir, { recursive: true, force: true })
    rmSync(projectDir, { recursive: true, force: true })
  })

  test('persists older tool results and replaces content with persisted-output placeholders', async () => {
    const big = 'x'.repeat(2_000) // ~500 tokens by heuristic

    const messages = [
      assistantToolUseMessage({ id: 'toolu_1', name: 'Read' }),
      userToolResultMessage({ toolUseId: 'toolu_1', content: big }),
      assistantToolUseMessage({ id: 'toolu_2', name: 'Read' }),
      userToolResultMessage({ toolUseId: 'toolu_2', content: big }),
      assistantToolUseMessage({ id: 'toolu_3', name: 'Read' }),
      userToolResultMessage({ toolUseId: 'toolu_3', content: big }),
      assistantToolUseMessage({ id: 'toolu_4', name: 'Read' }),
      userToolResultMessage({ toolUseId: 'toolu_4', content: big }),
      assistantToolUseMessage({ id: 'toolu_5', name: 'Read' }),
      userToolResultMessage({ toolUseId: 'toolu_5', content: big }),
    ]

    const outcome = await checkMicroCompact(
      messages as any,
      { options: { model: 'main' } },
      {
        trigger: 'manual',
        maxUncompactedToolResultTokens: 600, // force compaction
        keepLastToolUses: 3,
        previewChars: 80,
      },
    )

    expect(outcome.compactedToolUseIds.length).toBeGreaterThan(0)
    expect(outcome.boundaryMessage?.type).toBe('assistant')
    expect((outcome.boundaryMessage as any)?.isMeta).toBe(true)

    const stringified = JSON.stringify(outcome.messages)
    expect(stringified).toContain(PERSISTED_OUTPUT_OPEN_TAG)
    expect(stringified).toContain(PERSISTED_OUTPUT_CLOSE_TAG)

    // toolu_1 and toolu_2 should be compacted; last 3 should be preserved
    expect(stringified).toContain('toolu_1')
    expect(stringified).toContain('toolu_2')
    expect(outcome.compactedToolUseIds).toContain('toolu_1')
    expect(outcome.compactedToolUseIds).toContain('toolu_2')
    expect(outcome.compactedToolUseIds).not.toContain('toolu_3')
    expect(outcome.compactedToolUseIds).not.toContain('toolu_4')
    expect(outcome.compactedToolUseIds).not.toContain('toolu_5')

    const resultsDir = join(
      configDir,
      'projects',
      sanitizeProjectNameForSessionStore(projectDir),
      '704b907b-2b0f-478d-a7cb-b9fecf921913',
      'tool-results',
    )

    const path1 = join(resultsDir, 'toolu_1.txt')
    const path2 = join(resultsDir, 'toolu_2.txt')
    const path3 = join(resultsDir, 'toolu_3.txt')

    expect(existsSync(path1)).toBe(true)
    expect(existsSync(path2)).toBe(true)
    expect(existsSync(path3)).toBe(false)

    expect(readFileSync(path1, 'utf8')).toBe(big)
    expect(readFileSync(path2, 'utf8')).toBe(big)
  })
})
