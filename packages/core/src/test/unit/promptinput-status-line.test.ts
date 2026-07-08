import { describe, expect, test } from 'bun:test'
import {
  buildPromptInputStatusLine,
  getInputModeDisplay,
} from '#ui-ink/components/PromptInput/inputModeDisplay'

describe('PromptInput status line', () => {
  test('chat input explains special prefix entry points', () => {
    const display = getInputModeDisplay('prompt')

    expect(display.statusText).toBe('Input: Chat')
    expect(display.helperText).toBe('! shell · & background · # note')
  })

  test('shell-like modes explain how to return to chat', () => {
    expect(getInputModeDisplay('bash')).toMatchObject({
      statusText: 'Input: Shell',
      helperText: 'Esc back to chat',
    })
    expect(getInputModeDisplay('background')).toMatchObject({
      statusText: 'Input: Background shell',
      helperText: 'Esc back to chat',
    })
  })

  test('status line separates input mode from tool permissions', () => {
    const text = buildPromptInputStatusLine({
      mode: 'prompt',
      permissionMode: 'acceptEdits',
      modeCycleShortcutText: 'shift+tab',
      isLoading: true,
      pendingPromptCount: 1,
      queuedPromptCount: 2,
    })

    expect(text).toContain('Input: Chat')
    expect(text).toContain('! shell · & background · # note')
    expect(text).toContain('Tools: Auto-accept edits (shift+tab)')
    expect(text).toContain('Enter send · Tab queue')
    expect(text).toContain('pending 1')
    expect(text).toContain('queued 2')
  })
})
