import { describe, expect, test } from 'bun:test'
import { getTheme } from '#core/utils/theme'
import { __getModeIndicatorDisplayForTests } from '#ui-ink/components/ModeIndicator'

describe('ModeIndicator', () => {
  test('default mode is hidden', () => {
    const theme = getTheme('dark')
    const indicator = __getModeIndicatorDisplayForTests({
      mode: 'default',
      shortcutDisplayText: 'shift+tab',
      theme,
    })

    expect(indicator.shouldRender).toBe(false)
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
    expect(indicator.mainText + indicator.shortcutHintText).toBe(
      '⏵⏵ accept edits on (shift+tab to cycle)',
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
    expect(indicator.color).toBe(theme.planMode)
    expect(indicator.mainText + indicator.shortcutHintText).toBe(
      '⏸ plan mode on (shift+tab to cycle)',
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
    expect(indicator.mainText + indicator.shortcutHintText).toBe(
      '⏵⏵ bypass permissions on (alt+m to cycle)',
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
    expect(indicator.mainText + indicator.shortcutHintText).toBe(
      "⏵⏵ don't ask on (shift+tab to cycle)",
    )
  })
})
