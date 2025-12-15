import { test, expect, describe } from 'bun:test'
import { getAllTools } from '@tools'
import {
  __resetPlanModeForTests,
  enterPlanMode,
  exitPlanMode,
  getPlanConversationKey,
  getPlanFilePath,
  isPlanModeEnabled,
  setActivePlanConversationKey,
} from '@utils/planMode'
import { hasPermissionsToUseTool } from '@permissions'
import { FileWriteTool } from '@tools/FileWriteTool/FileWriteTool'
import { FileReadTool } from '@tools/FileReadTool/FileReadTool'
import { BashTool } from '@tools/BashTool/BashTool'
import { BunShell } from '@utils/BunShell'
import { join } from 'path'

const makeContext = (safeMode = true) => ({
  abortController: new AbortController(),
  messageId: 'test',
  options: {
    commands: [],
    tools: [],
    verbose: false,
    slowAndCapableModel: undefined,
    safeMode,
    forkNumber: 0,
    messageLogName: 'test',
    maxThinkingTokens: 0,
  },
  readFileTimestamps: {},
})

describe('Tool registry', () => {
  test('includes core built-in tools', () => {
    process.env.CLAUDE_CONFIG_DIR = join(process.cwd(), '.tmp-claude-config')
    const toolNames = getAllTools().map(t => t.name)
    expect(toolNames).toContain('Bash')
    expect(toolNames).toContain('WebFetch')
    expect(toolNames).toContain('WebSearch')
    expect(toolNames).toContain('AskUserQuestion')
    expect(toolNames).toContain('EnterPlanMode')
    expect(toolNames).toContain('ExitPlanMode')
    expect(toolNames).toContain('BashOutput')
    expect(toolNames).toContain('KillShell')
  })
})

describe('Plan mode gating', () => {
  test('blocks write tool while in plan mode', async () => {
    process.env.CLAUDE_CONFIG_DIR = join(process.cwd(), '.tmp-claude-config')
    __resetPlanModeForTests()
    const ctx = makeContext()
    setActivePlanConversationKey(getPlanConversationKey(ctx as any))
    enterPlanMode(ctx as any)
    expect(isPlanModeEnabled(ctx as any)).toBe(true)
    const result = await hasPermissionsToUseTool(
      FileWriteTool as any,
      { file_path: '/tmp/a', content: 'x' },
      ctx as any,
      {} as any,
    )
    expect(result.result).toBe(false)
    exitPlanMode(ctx as any)
  })

  test('allows read tool while in plan mode', async () => {
    process.env.CLAUDE_CONFIG_DIR = join(process.cwd(), '.tmp-claude-config')
    __resetPlanModeForTests()
    const ctx = makeContext(false)
    setActivePlanConversationKey(getPlanConversationKey(ctx as any))
    enterPlanMode(ctx as any)
    const result = await hasPermissionsToUseTool(
      FileReadTool as any,
      { file_path: '/tmp/a' },
      ctx as any,
      {} as any,
    )
    expect(result.result).toBe(false)
    expect((result as any).shouldPromptUser).not.toBe(false)
    exitPlanMode(ctx as any)
  })

  test('allows writing the plan file while in plan mode', async () => {
    process.env.CLAUDE_CONFIG_DIR = join(process.cwd(), '.tmp-claude-config')
    __resetPlanModeForTests()
    const ctx = makeContext()
    setActivePlanConversationKey(getPlanConversationKey(ctx as any))
    enterPlanMode(ctx as any)
    const planFilePath = getPlanFilePath(undefined, getPlanConversationKey(ctx as any))
    const result = await hasPermissionsToUseTool(
      FileWriteTool as any,
      { file_path: planFilePath, content: '# Plan\n' },
      ctx as any,
      {} as any,
    )
    expect(result.result).toBe(true)
    exitPlanMode(ctx as any)
  })
})

describe('Bash background execution', () => {
  test('executes background command and reports output', async () => {
    const { bashId } = BunShell.getInstance().execInBackground('echo hello')
    expect(bashId).toBeTruthy()
    // Allow process to finish
    await new Promise(resolve => setTimeout(resolve, 200))
    const output = BunShell.getInstance().getBackgroundOutput(bashId)
    expect(output).not.toBeNull()
    if (output) {
      expect(output.stdout.trim()).toBe('hello')
    }
  })
})
