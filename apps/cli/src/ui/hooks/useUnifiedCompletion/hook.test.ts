import { describe, expect, test } from 'bun:test'

import { __computeCompletionRefreshForTests } from './hook'
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

describe('__computeCompletionRefreshForTests', () => {
  test('refreshes active loading suggestions when new command matches arrive', () => {
    const state = makeState({
      isActive: true,
      context: {
        type: 'file',
        prefix: 'kub',
        startPos: 0,
        endPos: 3,
      },
      suggestions: [
        {
          value: 'loading...',
          displayValue: 'Loading system commands...',
          type: 'file',
          score: 0,
          metadata: { isLoading: true },
        },
      ],
    })

    const result = __computeCompletionRefreshForTests({
      isEnabled: true,
      state,
      suggestions: [
        {
          value: 'kubectl',
          displayValue: '$ kubectl',
          type: 'command',
          score: 100,
        },
      ],
    })

    expect(result.action).toBe('refresh')
    if (result.action !== 'refresh') return
    expect(result.suggestions[0]?.value).toBe('kubectl')
    expect(result.selectedIndex).toBe(0)
  })

  test('does not refresh while a completion preview is active', () => {
    const result = __computeCompletionRefreshForTests({
      isEnabled: true,
      state: makeState({
        isActive: true,
        context: {
          type: 'file',
          prefix: 'gi',
          startPos: 0,
          endPos: 2,
        },
        preview: {
          isActive: true,
          originalInput: 'gi',
          wordRange: [0, 3],
        },
      }),
      suggestions: [
        {
          value: 'git',
          displayValue: '$ git',
          type: 'command',
          score: 100,
        },
      ],
    })

    expect(result.action).toBe('none')
  })
})
