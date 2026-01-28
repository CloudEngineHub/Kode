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
    expect(indicator.mainText).toBe('?? ask mode')
    expect(indicator.shortcutHintText).toBe(' (shift+tab to cycle)')
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
    expect(indicator.mainText).toBe('yolo mode')
    expect(indicator.shortcutHintText).toBe(' (shift+tab to cycle)')
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
    expect(indicator.mainText).toBe('?? ask mode')
    expect(indicator.shortcutHintText).toBe(' (shift+tab to cycle)')
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
    expect(indicator.mainText).toBe('>> accept edits mode')
    expect(indicator.shortcutHintText).toBe(' (shift+tab to cycle)')
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
    expect(indicator.mainText).toBe('|| plan mode')
    expect(indicator.shortcutHintText).toBe(' (shift+tab to cycle)')
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
    expect(indicator.mainText).toBe('🚀 bypass mode')
    expect(indicator.shortcutHintText).toBe(' (alt+m to cycle)')
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
    expect(indicator.mainText).toBe("X don't ask mode")
    expect(indicator.shortcutHintText).toBe(' (shift+tab to cycle)')
  })
})
