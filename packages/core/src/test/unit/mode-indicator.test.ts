import { describe, expect, test } from 'bun:test'
import { getTheme } from '#core/utils/theme'
import { __getModeIndicatorDisplayForTests } from '#ui-ink/components/ModeIndicator'

describe('ModeIndicator', () => {
  test('default mode (legacy alias) normalizes to cautious and renders', () => {
    const theme = getTheme('dark')
    const indicator = __getModeIndicatorDisplayForTests({
      mode: 'default',
      shortcutDisplayText: 'shift+tab',
      theme,
    })

    expect(indicator.shouldRender).toBe(true)
    expect(indicator.mainText).toBe('Tool permissions: Ask before tools')
    expect(indicator.shortcutHintText).toBe(
      ' (shift+tab to change · ask before tool use)',
    )
  })

  test('yolo mode matches expected format', () => {
    const theme = getTheme('dark')
    const indicator = __getModeIndicatorDisplayForTests({
      mode: 'yolo',
      shortcutDisplayText: 'shift+tab',
      theme,
    })

    expect(indicator.shouldRender).toBe(true)
    expect(indicator.color).toBe(theme.secondaryText)
    expect(indicator.mainText).toBe('Tool permissions: Auto-run safe tools')
    expect(indicator.shortcutHintText).toBe(
      ' (shift+tab to change · safe tools can run without prompts)',
    )
  })

  test('cautious mode matches expected format', () => {
    const theme = getTheme('dark')
    const indicator = __getModeIndicatorDisplayForTests({
      mode: 'cautious',
      shortcutDisplayText: 'shift+tab',
      theme,
    })

    expect(indicator.shouldRender).toBe(true)
    expect(indicator.color).toBe(theme.warning)
    expect(indicator.mainText).toBe('Tool permissions: Ask before tools')
    expect(indicator.shortcutHintText).toBe(
      ' (shift+tab to change · ask before tool use)',
    )
  })

  test('acceptEdits matches expected format', () => {
    const theme = getTheme('dark')
    const indicator = __getModeIndicatorDisplayForTests({
      mode: 'acceptEdits',
      shortcutDisplayText: 'shift+tab',
      theme,
    })

    expect(indicator.shouldRender).toBe(true)
    expect(indicator.color).toBe(theme.autoAccept)
    expect(indicator.mainText).toBe('Tool permissions: Auto-accept edits')
    expect(indicator.shortcutHintText).toBe(
      ' (shift+tab to change · edits accepted automatically)',
    )
  })

  test('plan matches expected format', () => {
    const theme = getTheme('dark')
    const indicator = __getModeIndicatorDisplayForTests({
      mode: 'plan',
      shortcutDisplayText: 'shift+tab',
      theme,
    })

    expect(indicator.shouldRender).toBe(true)
    expect(indicator.color).toBe(theme.success)
    expect(indicator.mainText).toBe('Tool permissions: Plan first')
    expect(indicator.shortcutHintText).toBe(
      ' (shift+tab to change · review plans before implementation)',
    )
  })

  test('bypassPermissions matches expected format', () => {
    const theme = getTheme('dark')
    const indicator = __getModeIndicatorDisplayForTests({
      mode: 'bypassPermissions',
      shortcutDisplayText: 'alt+m',
      theme,
    })

    expect(indicator.shouldRender).toBe(true)
    expect(indicator.color).toBe(theme.error)
    expect(indicator.mainText).toBe('Tool permissions: Bypass permissions')
    expect(indicator.shortcutHintText).toBe(
      ' (alt+m to change · tool prompts bypassed)',
    )
  })

  test('dontAsk matches expected format', () => {
    const theme = getTheme('dark')
    const indicator = __getModeIndicatorDisplayForTests({
      mode: 'dontAsk',
      shortcutDisplayText: 'shift+tab',
      theme,
    })

    expect(indicator.shouldRender).toBe(true)
    expect(indicator.color).toBe(theme.error)
    expect(indicator.mainText).toBe('Tool permissions: Deny new tools')
    expect(indicator.shortcutHintText).toBe(
      ' (shift+tab to change · new tool requests denied)',
    )
  })
})
