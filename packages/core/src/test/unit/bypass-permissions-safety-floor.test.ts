import { describe, expect, test } from 'bun:test'
import { hasPermissionsToUseTool } from '#core/permissions'
import { FileWriteTool } from '#tools/tools/filesystem/FileWriteTool/FileWriteTool'
import { homedir } from 'os'
import { resolve } from 'path'
import type { ToolUseContext } from '#core/tooling/Tool'
import { createAssistantMessage } from '#core/utils/messages'

describe('bypassPermissions safety floor', () => {
  test('denies sensitive writes in bypassPermissions mode', async () => {
    const filePath = resolve(homedir(), '.ssh', 'config')
    const ctx: ToolUseContext = {
      abortController: new AbortController(),
      messageId: undefined,
      readFileTimestamps: {},
      options: { permissionMode: 'bypassPermissions', safeMode: false },
    }
    const result = await hasPermissionsToUseTool(
      FileWriteTool,
      { file_path: filePath, content: 'x' },
      ctx,
      createAssistantMessage(''),
    )
    expect(result.result).toBe(false)
    if (result.result !== false) throw new Error('Expected write to be denied')
    expect(result.shouldPromptUser).toBe(false)
    expect(result.message).toContain('sensitive')
  })

  test('allows bypassing the safety floor via env (non-safe mode)', async () => {
    const prev = process.env.KODE_BYPASS_SAFETY_FLOOR
    process.env.KODE_BYPASS_SAFETY_FLOOR = '1'
    try {
      const filePath = resolve(homedir(), '.ssh', 'config')
      const ctx: ToolUseContext = {
        abortController: new AbortController(),
        messageId: undefined,
        readFileTimestamps: {},
        options: { permissionMode: 'bypassPermissions', safeMode: false },
      }
      const result = await hasPermissionsToUseTool(
        FileWriteTool,
        { file_path: filePath, content: 'x' },
        ctx,
        createAssistantMessage(''),
      )
      expect(result.result).toBe(true)
    } finally {
      if (prev === undefined) delete process.env.KODE_BYPASS_SAFETY_FLOOR
      else process.env.KODE_BYPASS_SAFETY_FLOOR = prev
    }
  })
})
