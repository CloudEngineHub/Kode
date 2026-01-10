import { describe, expect, test, beforeEach } from 'bun:test'
import { createDefaultToolPermissionContext } from '#core/types/toolPermissionContext'
import { checkBashPermissions } from '#core/utils/permissions/bashToolPermissionEngine'
import { hasPermissionsToUseTool } from '#core/permissions'
import { BashTool } from '#tools/tools/system/BashTool/BashTool'
import {
  getCurrentProjectConfig,
  saveCurrentProjectConfig,
} from '#core/utils/config'
import type { ToolUseContext } from '#core/tooling/Tool'
import type { PermissionMode } from '#core/types/PermissionMode'
import { createAssistantMessage } from '#core/utils/messages'

function makeToolUseContext(
  permissionMode: PermissionMode = 'default',
): ToolUseContext {
  return {
    abortController: new AbortController(),
    messageId: 'test',
    readFileTimestamps: {},
    options: {
      commands: [],
      tools: [],
      verbose: false,
      safeMode: false,
      forkNumber: 0,
      messageLogName: 'test',
      maxThinkingTokens: 0,
      permissionMode,
    },
  }
}

describe('Bash permission engine parity', () => {
  beforeEach(() => {
    const current = getCurrentProjectConfig()
    saveCurrentProjectConfig({
      ...current,
      allowedTools: [],
      deniedTools: [],
      askedTools: [],
    })
  })

  test('allows when prefix rule matches single command', async () => {
    const toolPermissionContext = createDefaultToolPermissionContext()
    toolPermissionContext.alwaysAllowRules.localSettings = ['Bash(git:*)']

    const result = await checkBashPermissions({
      command: 'git status',
      toolPermissionContext,
      toolUseContext: makeToolUseContext(),
    })

    expect(result).toEqual({ result: true })
  })

  test('allows when wildcard rule matches', async () => {
    const toolPermissionContext = createDefaultToolPermissionContext()
    toolPermissionContext.alwaysAllowRules.localSettings = ['Bash(git * main)']

    const result = await checkBashPermissions({
      command: 'git checkout main',
      toolPermissionContext,
      toolUseContext: makeToolUseContext(),
    })

    expect(result).toEqual({ result: true })
  })

  test('ask wildcard overrides allow wildcard', async () => {
    const toolPermissionContext = createDefaultToolPermissionContext()
    toolPermissionContext.alwaysAllowRules.localSettings = ['Bash(git *)']
    toolPermissionContext.alwaysAskRules.localSettings = ['Bash(git * main)']

    const result = await checkBashPermissions({
      command: 'git checkout main',
      toolPermissionContext,
      toolUseContext: makeToolUseContext(),
    })

    expect(result.result).toBe(false)
    if (result.result !== false) throw new Error('Expected permission prompt')
    expect(result.shouldPromptUser).not.toBe(false)
  })

  test('deny overrides allow (exact deny beats prefix allow)', async () => {
    const toolPermissionContext = createDefaultToolPermissionContext()
    toolPermissionContext.alwaysAllowRules.localSettings = ['Bash(git:*)']
    toolPermissionContext.alwaysDenyRules.localSettings = ['Bash(git status)']

    const result = await checkBashPermissions({
      command: 'git status',
      toolPermissionContext,
      toolUseContext: makeToolUseContext(),
    })

    expect(result).toEqual({
      result: false,
      message:
        'Permission to use Bash with command git status has been denied.',
      shouldPromptUser: false,
    })
  })

  test('ask overrides allow', async () => {
    const toolPermissionContext = createDefaultToolPermissionContext()
    toolPermissionContext.alwaysAllowRules.localSettings = ['Bash(git:*)']
    toolPermissionContext.alwaysAskRules.localSettings = ['Bash(git status)']

    const result = await checkBashPermissions({
      command: 'git status',
      toolPermissionContext,
      toolUseContext: makeToolUseContext(),
    })

    expect(result.result).toBe(false)
    if (result.result !== false) throw new Error('Expected permission prompt')
    expect(result.shouldPromptUser).not.toBe(false)
  })

  test('command injection check requires approval', async () => {
    const toolPermissionContext = createDefaultToolPermissionContext()

    const result = await checkBashPermissions({
      command: 'echo $(id)',
      toolPermissionContext,
      toolUseContext: makeToolUseContext(),
    })

    expect(result.result).toBe(false)
    if (result.result !== false) throw new Error('Expected permission prompt')
    expect(result.shouldPromptUser).not.toBe(false)
    expect(result.message).toContain('$()')
  })

  test('dontAsk mode auto-denies promptable bash tool use', async () => {
    const ctx = makeToolUseContext('dontAsk')
    const result = await hasPermissionsToUseTool(
      BashTool,
      { command: 'echo hi' },
      ctx,
      createAssistantMessage(''),
    )

    expect(result).toEqual({
      result: false,
      shouldPromptUser: false,
      message: 'Permission to use Bash has been auto-denied in dontAsk mode.',
    })
  })
})
