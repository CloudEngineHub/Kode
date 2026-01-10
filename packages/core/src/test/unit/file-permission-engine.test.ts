import { beforeEach, describe, expect, test } from 'bun:test'
import { hasPermissionsToUseTool } from '#core/permissions'
import { FileReadTool } from '#tools/tools/filesystem/FileReadTool/FileReadTool'
import { FileWriteTool } from '#tools/tools/filesystem/FileWriteTool/FileWriteTool'
import {
  applyToolPermissionContextUpdates,
  createDefaultToolPermissionContext,
  type ToolPermissionContextUpdate,
} from '#core/types/toolPermissionContext'
import type { ToolUseContext } from '#core/tooling/Tool'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import {
  __resetPlanModeForTests,
  getPlanConversationKey,
  getPlanFilePath,
} from '#core/utils/planMode'
import { createAssistantMessage } from '#core/utils/messages'

function makeContext(args?: {
  toolPermissionContext?: ReturnType<typeof createDefaultToolPermissionContext>
  messageLogName?: string
  forkNumber?: number
}): ToolUseContext {
  return {
    abortController: new AbortController(),
    messageId: 'test',
    options: {
      commands: [],
      tools: [],
      verbose: false,
      slowAndCapableModel: undefined,
      safeMode: false,
      forkNumber: args?.forkNumber ?? 0,
      messageLogName: args?.messageLogName ?? 'test',
      maxThinkingTokens: 0,
      toolPermissionContext: args?.toolPermissionContext,
    },
    readFileTimestamps: {},
  }
}

describe('Compatibility: filesystem permission engine', () => {
  beforeEach(() => {
    __resetPlanModeForTests()
  })

  test('allows reading inside working directory by default', async () => {
    const toolPermissionContext = createDefaultToolPermissionContext({
      isBypassPermissionsModeAvailable: true,
    })
    const ctx = makeContext({ toolPermissionContext })

    const result = await hasPermissionsToUseTool(
      FileReadTool,
      { file_path: 'package.json' },
      ctx,
      createAssistantMessage(''),
    )

    expect(result.result).toBe(true)
  })

  test('asks to read outside working directory and provides suggestions', async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'kode-perm-read-'))
    const filePath = path.join(tmp, 'a.txt')
    writeFileSync(filePath, 'hello', 'utf8')

    try {
      const toolPermissionContext = createDefaultToolPermissionContext({
        isBypassPermissionsModeAvailable: true,
      })
      const ctx = makeContext({ toolPermissionContext })

      const result = await hasPermissionsToUseTool(
        FileReadTool,
        { file_path: filePath },
        ctx,
        createAssistantMessage(''),
      )

      expect(result.result).toBe(false)
      if (result.result !== false) {
        throw new Error('Expected permission denied result')
      }
      expect(result.suggestions?.length ?? 0).toBeGreaterThan(0)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  test('applying read suggestions allows subsequent reads', async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'kode-perm-read-apply-'))
    const filePath = path.join(tmp, 'a.txt')
    writeFileSync(filePath, 'hello', 'utf8')

    try {
      const base = createDefaultToolPermissionContext({
        isBypassPermissionsModeAvailable: true,
      })
      const ctx = makeContext({ toolPermissionContext: base })

      const denied = await hasPermissionsToUseTool(
        FileReadTool,
        { file_path: filePath },
        ctx,
        createAssistantMessage(''),
      )

      expect(denied.result).toBe(false)
      if (denied.result !== false) {
        throw new Error('Expected permission denied result')
      }
      const updates: ToolPermissionContextUpdate[] = denied.suggestions ?? []
      expect(updates.length).toBeGreaterThan(0)

      const updatedContext = applyToolPermissionContextUpdates(base, updates)
      const ctx2 = makeContext({ toolPermissionContext: updatedContext })
      const allowed = await hasPermissionsToUseTool(
        FileReadTool,
        { file_path: filePath },
        ctx2,
        createAssistantMessage(''),
      )
      expect(allowed.result).toBe(true)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  test('applying write suggestions allows subsequent writes via acceptEdits + addDirectories', async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'kode-perm-write-apply-'))
    const filePath = path.join(tmp, 'b.txt')

    try {
      const base = createDefaultToolPermissionContext({
        isBypassPermissionsModeAvailable: true,
      })
      const ctx = makeContext({ toolPermissionContext: base })

      const denied = await hasPermissionsToUseTool(
        FileWriteTool,
        { file_path: filePath, content: 'hi' },
        ctx,
        createAssistantMessage(''),
      )

      expect(denied.result).toBe(false)
      if (denied.result !== false) {
        throw new Error('Expected permission denied result')
      }
      const updates: ToolPermissionContextUpdate[] = denied.suggestions ?? []
      expect(updates.length).toBeGreaterThan(0)
      expect(
        updates.some(u => u.type === 'setMode' && u.mode === 'acceptEdits'),
      ).toBe(true)
      expect(updates.some(u => u.type === 'addDirectories')).toBe(true)

      const updatedContext = applyToolPermissionContextUpdates(base, updates)
      const ctx2 = makeContext({ toolPermissionContext: updatedContext })
      const allowed = await hasPermissionsToUseTool(
        FileWriteTool,
        { file_path: filePath, content: 'hi' },
        ctx2,
        createAssistantMessage(''),
      )
      expect(allowed.result).toBe(true)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  test('allows writing to the plan file for the current conversation', async () => {
    const tmpConfig = mkdtempSync(path.join(tmpdir(), 'kode-plan-config-'))
    const previousConfigDir = process.env.KODE_CONFIG_DIR
    process.env.KODE_CONFIG_DIR = tmpConfig

    try {
      const toolPermissionContext = createDefaultToolPermissionContext({
        isBypassPermissionsModeAvailable: true,
      })
      const ctx = makeContext({
        toolPermissionContext,
        messageLogName: 'plan-test',
        forkNumber: 0,
      })

      const conversationKey = getPlanConversationKey(ctx)
      const planFilePath = getPlanFilePath(undefined, conversationKey)
      mkdirSync(path.dirname(planFilePath), { recursive: true })

      const result = await hasPermissionsToUseTool(
        FileWriteTool,
        { file_path: planFilePath, content: 'plan' },
        ctx,
        createAssistantMessage(''),
      )
      expect(result.result).toBe(true)
    } finally {
      process.env.KODE_CONFIG_DIR = previousConfigDir
      rmSync(tmpConfig, { recursive: true, force: true })
    }
  })

  test('asks for UNC paths and does not provide suggestions', async () => {
    const toolPermissionContext = createDefaultToolPermissionContext({
      isBypassPermissionsModeAvailable: true,
    })
    const ctx = makeContext({ toolPermissionContext })

    const result = await hasPermissionsToUseTool(
      FileReadTool,
      { file_path: '//server/share/file.txt' },
      ctx,
      createAssistantMessage(''),
    )

    expect(result.result).toBe(false)
    if (result.result !== false) {
      throw new Error('Expected permission denied result')
    }
    expect(result.suggestions).toBeUndefined()
  })

  test('asks for suspicious Windows path patterns and does not provide suggestions', async () => {
    const toolPermissionContext = createDefaultToolPermissionContext({
      isBypassPermissionsModeAvailable: true,
    })
    const ctx = makeContext({ toolPermissionContext })

    const result = await hasPermissionsToUseTool(
      FileReadTool,
      { file_path: 'C:\\\\foo:bar' },
      ctx,
      createAssistantMessage(''),
    )

    expect(result.result).toBe(false)
    if (result.result !== false) {
      throw new Error('Expected permission denied result')
    }
    expect(result.suggestions).toBeUndefined()
  })

  test('symlink target outside working dirs requires manual approval unless added to additionalWorkingDirectories', async () => {
    const outside = mkdtempSync(path.join(tmpdir(), 'kode-perm-symlink-out-'))
    const outsideFile = path.join(outside, 'target.txt')
    writeFileSync(outsideFile, 'x', 'utf8')

    const inside = mkdtempSync(path.join(tmpdir(), 'kode-perm-symlink-in-'))
    const linkPath = path.join(inside, 'link.txt')
    symlinkSync(outsideFile, linkPath)

    try {
      const base = createDefaultToolPermissionContext({
        isBypassPermissionsModeAvailable: true,
      })
      const ctx = makeContext({ toolPermissionContext: base })

      const denied = await hasPermissionsToUseTool(
        FileReadTool,
        { file_path: linkPath },
        ctx,
        createAssistantMessage(''),
      )
      expect(denied.result).toBe(false)

      const updated = applyToolPermissionContextUpdates(base, [
        {
          type: 'addDirectories',
          destination: 'session',
          directories: [outside],
        },
      ])
      const ctx2 = makeContext({ toolPermissionContext: updated })
      const allowed = await hasPermissionsToUseTool(
        FileReadTool,
        { file_path: linkPath },
        ctx2,
        createAssistantMessage(''),
      )
      expect(allowed.result).toBe(true)
    } finally {
      rmSync(outside, { recursive: true, force: true })
      rmSync(inside, { recursive: true, force: true })
    }
  })
})
