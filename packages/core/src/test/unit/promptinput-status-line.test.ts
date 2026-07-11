import { describe, expect, test } from 'bun:test'
import {
  buildPromptInputStatusLine,
  getInputModeDisplay,
} from '#ui-ink/components/PromptInput/inputModeDisplay'

describe('PromptInput status line', () => {
  test('keeps chat entry points compact', () => {
    const display = getInputModeDisplay('prompt')

    expect(display.statusText).toBe('Chat')
    expect(display.helperText).toBe('/ commands \u00b7 & bg')
  })

  test('uses short return guidance for shell-like modes', () => {
    expect(getInputModeDisplay('bash')).toMatchObject({
      prefix: '',
      statusText: 'Shell',
      helperText: 'Esc chat',
    })
    expect(getInputModeDisplay('background')).toMatchObject({
      statusText: 'Shell (bg)',
      helperText: 'Esc chat',
    })
  })

  test('keeps mode, tool policy, and queue controls distinct without redundant send help', () => {
    const text = buildPromptInputStatusLine({
      mode: 'prompt',
      permissionMode: 'acceptEdits',
      modeCycleShortcutText: 'shift+tab',
      isLoading: true,
      pendingPromptCount: 1,
      queuedPromptCount: 2,
    })

    expect(text).toContain('Chat')
    expect(text).toContain('/ commands \u00b7 & bg')
    expect(text).toContain('Tools Auto edits (shift+tab)')
    expect(text).toContain('Tab queue')
    expect(text).toContain('pending 1')
    expect(text).toContain('queued 2')
    expect(text).not.toContain('Enter send')
    expect(text).not.toContain('Auto-accept edits')
  })

  test('retains the safety qualifier for automatic tool execution', () => {
    const text = buildPromptInputStatusLine({
      mode: 'prompt',
      permissionMode: 'yolo',
      modeCycleShortcutText: 'shift+tab',
      isLoading: false,
      pendingPromptCount: 0,
      queuedPromptCount: 0,
    })

    expect(text).toContain('Tools Safe auto (shift+tab)')
  })
})
