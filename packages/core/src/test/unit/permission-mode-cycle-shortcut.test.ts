import { describe, expect, test } from 'bun:test'
import { __getPermissionModeCycleShortcutForTests } from '#ui-ink/utils/permissionModeCycleShortcut'
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

describe('permission mode cycle shortcut', () => {
  test('non-Windows defaults to shift+tab', () => {
    const shortcut = __getPermissionModeCycleShortcutForTests({
      platform: 'darwin',
      bunVersion: '1.2.0',
      nodeVersion: '22.0.0',
    })

    expect(shortcut.displayText).toBe('shift+tab')
    expect(shortcut.check('', makeKey({ tab: true, shift: true }))).toBe(true)
    expect(shortcut.check('m', makeKey({ meta: true }))).toBe(false)
  })

  test('Windows: Bun <1.2.23 falls back to alt+m', () => {
    const shortcut = __getPermissionModeCycleShortcutForTests({
      platform: 'win32',
      bunVersion: '1.2.22',
    })

    expect(shortcut.displayText).toBe('alt+m')
    expect(shortcut.check('m', makeKey({ meta: true }))).toBe(true)
    expect(shortcut.check('M', makeKey({ meta: true }))).toBe(true)
    expect(shortcut.check('', makeKey({ tab: true, shift: true }))).toBe(false)
  })

  test('Windows: Bun >=1.2.23 uses shift+tab', () => {
    const shortcut = __getPermissionModeCycleShortcutForTests({
      platform: 'win32',
      bunVersion: '1.2.23',
    })

    expect(shortcut.displayText).toBe('shift+tab')
    expect(shortcut.check('', makeKey({ tab: true, shift: true }))).toBe(true)
    expect(shortcut.check('m', makeKey({ meta: true }))).toBe(false)
  })

  test('Windows: Node >=22.17.0 <23.0.0 uses shift+tab', () => {
    const shortcut = __getPermissionModeCycleShortcutForTests({
      platform: 'win32',
      nodeVersion: '22.17.0',
    })

    expect(shortcut.displayText).toBe('shift+tab')
  })

  test('Windows: invalid version strings fall back to alt+m', () => {
    const shortcut = __getPermissionModeCycleShortcutForTests({
      platform: 'win32',
      bunVersion: 'not-a-version',
    })

    expect(shortcut.displayText).toBe('alt+m')
  })
})
