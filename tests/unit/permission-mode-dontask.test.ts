import { describe, expect, test, beforeEach } from 'bun:test'
import {
  PermissionMode,
  getNextPermissionMode,
  MODE_CONFIGS,
} from '@kode-types/permissionMode'
import { hasPermissionsToUseTool } from '@permissions'
import {
  __resetPermissionModeStateForTests,
  getPermissionMode,
  setPermissionMode,
} from '@utils/permissions/permissionModeState'
import { __getModeIndicatorDisplayForTests } from '@components/ModeIndicator'
import { getTheme } from '@utils/theme'

describe('dontAsk PermissionMode type integration', () => {
  beforeEach(() => {
    __resetPermissionModeStateForTests()
  })

  test('dontAsk is a valid PermissionMode', () => {
    const mode: PermissionMode = 'dontAsk'
    expect(mode).toBe('dontAsk')
  })

  test('MODE_CONFIGS includes dontAsk with correct config', () => {
    const config = MODE_CONFIGS.dontAsk
    expect(config).toBeDefined()
    expect(config.name).toBe('dontAsk')
    expect(config.label).toBe("DON'T ASK")
    expect(config.color).toBe('red')
    expect(config.restrictions.requireConfirmation).toBe(false)
    expect(config.restrictions.bypassValidation).toBe(false)
    expect(config.allowedTools).toEqual(['*'])
  })

  test('getNextPermissionMode cycles from dontAsk to default', () => {
    expect(getNextPermissionMode('dontAsk', true)).toBe('default')
    expect(getNextPermissionMode('dontAsk', false)).toBe('default')
  })

  test('getPermissionMode returns dontAsk when set', () => {
    const ctx = {
      options: {
        forkNumber: 0,
        messageLogName: 'test-dontask',
      },
    } as any

    setPermissionMode(ctx, 'dontAsk')
    expect(getPermissionMode(ctx)).toBe('dontAsk')
  })

  test('dontAsk auto-denies tool uses without prompting', async () => {
    const ctx = {
      abortController: new AbortController(),
      messageId: 'test',
      options: {
        commands: [],
        tools: [],
        verbose: false,
        safeMode: false,
        forkNumber: 0,
        messageLogName: 'test-dontask-perm',
        maxThinkingTokens: 0,
        permissionMode: 'dontAsk',
      },
      readFileTimestamps: {},
    }

    const fakeTool = {
      name: 'TestTool',
      needsPermissions: () => true,
      isReadOnly: () => false,
    } as any

    const result = await hasPermissionsToUseTool(
      fakeTool,
      {},
      ctx as any,
      {} as any,
    )

    expect(result.result).toBe(false)
    expect(result.shouldPromptUser).toBe(false)
    expect(result.message).toContain('auto-denied')
    expect(result.message).toContain('dontAsk')
  })

  test('dontAsk mode indicator renders correctly', () => {
    const theme = getTheme('dark')
    const indicator = __getModeIndicatorDisplayForTests({
      mode: 'dontAsk',
      shortcutDisplayText: 'shift+tab',
      theme,
    })

    expect(indicator.shouldRender).toBe(true)
    expect(indicator.color).toBe(theme.error)
    expect(indicator.mainText).toContain("don't ask")
  })

  test('all PermissionMode values are handled in getNextPermissionMode', () => {
    const modes: PermissionMode[] = [
      'default',
      'acceptEdits',
      'plan',
      'bypassPermissions',
      'dontAsk',
    ]

    for (const mode of modes) {
      const next = getNextPermissionMode(mode, true)
      expect(typeof next).toBe('string')
      expect(modes).toContain(next)
    }
  })

  test('all PermissionMode values have MODE_CONFIGS entries', () => {
    const modes: PermissionMode[] = [
      'default',
      'acceptEdits',
      'plan',
      'bypassPermissions',
      'dontAsk',
    ]

    for (const mode of modes) {
      expect(MODE_CONFIGS[mode]).toBeDefined()
      expect(MODE_CONFIGS[mode].name).toBe(mode)
    }
  })
})
