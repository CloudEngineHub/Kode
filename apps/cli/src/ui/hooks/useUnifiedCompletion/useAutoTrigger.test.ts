import { describe, expect, test } from 'bun:test'

import { __computeAutoTriggerActionForTests } from './useAutoTrigger'

import type {
  CompletionContext,
  UnifiedSuggestion,
} from '#cli-utils/completion/types'
import type { CompletionState } from './types'

function makeState(overrides: Partial<CompletionState>): CompletionState {
  return {
    suggestions: [],
    selectedIndex: 0,
    isActive: false,
    context: null,
    preview: null,
    emptyDirMessage: '',
    suppressUntil: 0,
    ...overrides,
  }
}

describe('__computeAutoTriggerActionForTests', () => {
  test('closes active panel when context disappears (e.g. deleting "/")', () => {
    const prevContext: CompletionContext = {
      type: 'command',
      prefix: '/',
      startPos: 0,
      endPos: 1,
    }

    const result = __computeAutoTriggerActionForTests({
      previousInput: '/',
      input: '',
      now: 1000,
      lastInputTime: 800,
      isEnabled: true,
      state: makeState({ isActive: true, context: prevContext }),
      context: null,
      generateSuggestions: () => [],
    })

    expect(result.action).toBe('reset')
  })

  test('suppresses auto-trigger during likely IME input when panel is inactive', () => {
    const context: CompletionContext = {
      type: 'command',
      prefix: '/h',
      startPos: 0,
      endPos: 2,
    }

    const suggestions: UnifiedSuggestion[] = [
      { type: 'command', value: 'help', displayValue: 'help', score: 1 },
    ]

    const result = __computeAutoTriggerActionForTests({
      previousInput: '/',
      input: '/h',
      now: 1000,
      lastInputTime: 950, // 50ms => IME heuristic triggers
      isEnabled: true,
      state: makeState({ isActive: false, context: null }),
      context,
      generateSuggestions: () => suggestions,
    })

    expect(result.action).toBe('none')
  })

  test('auto-triggers when not in IME heuristic window', () => {
    const context: CompletionContext = {
      type: 'command',
      prefix: '/h',
      startPos: 0,
      endPos: 2,
    }

    const suggestions: UnifiedSuggestion[] = [
      { type: 'command', value: 'help', displayValue: 'help', score: 1 },
    ]

    const result = __computeAutoTriggerActionForTests({
      previousInput: '/',
      input: '/h',
      now: 1000,
      lastInputTime: 0, // 1000ms => not IME heuristic
      isEnabled: true,
      state: makeState({ isActive: false, context: null }),
      context,
      generateSuggestions: () => suggestions,
    })

    expect(result.action).toBe('activate')
    expect(result.suggestions?.length).toBe(1)
  })

  test('auto-hides a single exact-match suggestion', () => {
    const context: CompletionContext = {
      type: 'command',
      prefix: '/help',
      startPos: 0,
      endPos: 5,
    }

    const suggestions: UnifiedSuggestion[] = [
      { type: 'command', value: 'help', displayValue: 'help', score: 1 },
    ]

    const result = __computeAutoTriggerActionForTests({
      previousInput: '/hel',
      input: '/help',
      now: 1000,
      lastInputTime: 0,
      isEnabled: true,
      state: makeState({ isActive: false, context: null }),
      context,
      generateSuggestions: () => suggestions,
    })

    expect(result.action).toBe('reset')
  })
})
