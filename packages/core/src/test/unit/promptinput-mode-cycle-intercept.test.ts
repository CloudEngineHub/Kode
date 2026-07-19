import { describe, expect, test } from 'bun:test'
import { __getPermissionModeCycleShortcutForTests } from '#ui-ink/utils/permissionModeCycleShortcut'
import { __getPromptInputSpecialKeyActionForTests } from '#ui-ink/utils/promptInputSpecialKey'
import { __shouldHandleUnifiedCompletionTabKeyForTests } from '#ui-ink/hooks/useUnifiedCompletion'
import type { Key } from '#ui-ink/hooks/useKeypress'

function makeKey(overrides: Partial<Key>): Key {
  return {
    sequence: '',
    name: '',
    upArrow: false,
    downArrow: false,
    leftArrow: false,
    rightArrow: false,
    pageDown: false,
    pageUp: false,
    return: false,
    escape: false,
    ctrl: false,
    shift: false,
    tab: false,
    backspace: false,
    delete: false,
    meta: false,
    paste: false,
    insertable: false,
    ...overrides,
  }
}

describe('PromptInput mode-cycle intercept', () => {
  test('Shift+Tab prefers mode cycle over completion Tab', () => {
    const shortcut = __getPermissionModeCycleShortcutForTests({
      platform: 'darwin',
    })

    const key = makeKey({ tab: true, shift: true })

    expect(__shouldHandleUnifiedCompletionTabKeyForTests(key)).toBe(false)
    expect(
      __getPromptInputSpecialKeyActionForTests({
        inputChar: '',
        key,
        modeCycleShortcut: shortcut,
      }),
    ).toBe('modeCycle')
  })

  test('Tab (no shift) remains available for completion', () => {
    const shortcut = __getPermissionModeCycleShortcutForTests({
      platform: 'darwin',
    })

    const key = makeKey({ tab: true, shift: false })

    expect(__shouldHandleUnifiedCompletionTabKeyForTests(key)).toBe(true)
    expect(
      __getPromptInputSpecialKeyActionForTests({
        inputChar: '',
        key,
        modeCycleShortcut: shortcut,
      }),
    ).toBe(null)
  })

  test('On older Windows runtimes, F9 cycles mode and Alt+M still switches models', () => {
    const shortcut = __getPermissionModeCycleShortcutForTests({
      platform: 'win32',
      nodeVersion: '22.16.0',
    })

    expect(
      __getPromptInputSpecialKeyActionForTests({
        inputChar: '',
        key: makeKey({ name: 'f9' }),
        modeCycleShortcut: shortcut,
      }),
    ).toBe('modeCycle')

    expect(
      __getPromptInputSpecialKeyActionForTests({
        inputChar: 'm',
        key: makeKey({ meta: true }),
        modeCycleShortcut: shortcut,
      }),
    ).toBe('modelSwitch')
  })

  test('Ctrl+B inserts the /bash command prefix instead of toggling Bash mode', () => {
    const shortcut = __getPermissionModeCycleShortcutForTests({
      platform: 'darwin',
    })

    expect(
      __getPromptInputSpecialKeyActionForTests({
        inputChar: String.fromCharCode(2),
        key: makeKey({ ctrl: true }),
        modeCycleShortcut: shortcut,
      }),
    ).toBe('bashCommandPrefix')
  })
})
