import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { ExitPlanModeTool } from '#tools/tools/interaction/PlanModeTool/ExitPlanModeTool'
import {
  __resetPlanModeForTests,
  enterPlanMode,
  getPlanConversationKey,
  getPlanFilePath,
  isPlanModeEnabled,
} from '#core/utils/planMode'
import { __getExitPlanModePlanTextForTests } from '#tools/tools/interaction/PlanModeTool/ExitPlanModeTool'
import type { ToolUseContext } from '#core/tooling/Tool'

const makeContext = (): ToolUseContext => ({
  abortController: new AbortController(),
  messageId: 'test',
  options: {
    commands: [],
    tools: [],
    verbose: false,
    safeMode: false,
    forkNumber: 0,
    messageLogName: 'exit-plan-mode',
    maxThinkingTokens: 0,
  },
  readFileTimestamps: {},
})

describe('ExitPlanModeTool', () => {
  let configDir: string

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'kode-config-'))
    process.env.KODE_CONFIG_DIR = configDir
    __resetPlanModeForTests()
  })

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true })
  })

  test('does not throw when no plan file exists (plan is null)', async () => {
    const ctx = makeContext()
    const conversationKey = getPlanConversationKey(ctx)
    const planFilePath = getPlanFilePath(undefined, conversationKey)

    if (existsSync(planFilePath)) {
      rmSync(planFilePath, { force: true })
    }

    const gen = ExitPlanModeTool.call({}, ctx)
    const first = await gen.next()

    expect(first.done).toBe(false)
    if (first.done || !first.value) {
      throw new Error('Expected ExitPlanModeTool to yield a result')
    }
    expect(first.value.type).toBe('result')
    expect(first.value.data.filePath).toBe(planFilePath)
    expect(first.value.data.plan).toBe(null)
  })

  test('approved output includes filePath and plan content', async () => {
    const ctx = makeContext()
    const conversationKey = getPlanConversationKey(ctx)
    const planFilePath = getPlanFilePath(undefined, conversationKey)

    writeFileSync(planFilePath, '# Plan\n\n- Do the thing\n', 'utf-8')

    const gen = ExitPlanModeTool.call({}, ctx)
    const first = await gen.next()

    expect(first.done).toBe(false)
    if (first.done || !first.value) {
      throw new Error('Expected ExitPlanModeTool to yield a result')
    }
    expect(first.value.type).toBe('result')
    expect(first.value.data.filePath).toBe(planFilePath)
    expect(first.value.data.plan).toContain('Do the thing')
    expect(first.value.resultForAssistant).toContain(planFilePath)
  })

  test('exits plan mode when called', async () => {
    const ctx = makeContext()
    enterPlanMode(ctx)
    expect(isPlanModeEnabled(ctx)).toBe(true)

    const gen = ExitPlanModeTool.call({}, ctx)
    await gen.next()

    expect(isPlanModeEnabled(ctx)).toBe(false)
  })

  test('rejection display reads and includes the plan file content', () => {
    const ctx = makeContext()
    const conversationKey = getPlanConversationKey(ctx)
    const planFilePath = getPlanFilePath(undefined, conversationKey)

    writeFileSync(planFilePath, '# Plan\n\n- Keep planning\n', 'utf-8')

    expect(__getExitPlanModePlanTextForTests(conversationKey)).toContain(
      'Keep planning',
    )
  })
})
