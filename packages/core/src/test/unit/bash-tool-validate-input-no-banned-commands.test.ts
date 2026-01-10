import { describe, expect, test } from 'bun:test'
import { createDefaultToolPermissionContext } from '#core/types/toolPermissionContext'
import { hasPermissionsToUseTool } from '#core/permissions'
import { BashTool } from '#tools/tools/system/BashTool/BashTool'
import type { ToolUseContext } from '#core/tooling/Tool'
import { createAssistantMessage } from '#core/utils/messages'

describe('BashTool validateInput does not hard-ban base commands (compatibility)', () => {
  test('validateInput allows curl/wget/nc; permissions still gate execution', async () => {
    const curlInput = { command: 'curl https://example.com' }
    const wgetInput = { command: 'wget https://example.com' }
    const ncInput = { command: 'nc -vz example.com 443' }

    expect((await BashTool.validateInput!(curlInput)).result).toBe(true)
    expect((await BashTool.validateInput!(wgetInput)).result).toBe(true)
    expect((await BashTool.validateInput!(ncInput)).result).toBe(true)

    const toolPermissionContext = createDefaultToolPermissionContext()
    const toolUseContext: ToolUseContext = {
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
        permissionMode: 'default',
        toolPermissionContext,
      },
    }

    const permission = await hasPermissionsToUseTool(
      BashTool,
      curlInput,
      toolUseContext,
      createAssistantMessage(''),
    )
    expect(permission.result).toBe(false)
    if (permission.result !== false) {
      throw new Error('Expected permission denied result')
    }
    expect(permission.shouldPromptUser).not.toBe(false)
    expect(permission.message).toContain('requested permissions to use Bash')
  })
})
