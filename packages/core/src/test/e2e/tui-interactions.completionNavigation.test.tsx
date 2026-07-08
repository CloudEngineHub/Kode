import { afterEach, describe, expect, test } from 'bun:test'
import React, { useCallback, useState } from 'react'
import { Text } from 'ink'
import { KeypressProvider } from '#ui-ink/contexts/KeypressContext'
import { useUnifiedCompletionNavigationKeys } from '#ui-ink/hooks/useUnifiedCompletion/useNavigationKeys'
import type { CompletionState } from '#ui-ink/hooks/useUnifiedCompletion/types'
import type {
  CompletionContext,
  UnifiedSuggestion,
} from '#cli-utils/completion/types'
import { createInkHarnessManager, createInkTestHarness } from './inkTestHarness'

const harnessManager = createInkHarnessManager()

afterEach(async () => {
  await harnessManager.cleanup()
})

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

const directorySuggestion: UnifiedSuggestion = {
  value: 'empty/',
  displayValue: 'empty/',
  type: 'file',
  score: 1,
}

const directoryContext: CompletionContext = {
  type: 'file',
  trigger: '@',
  prefix: 'empty/',
  startPos: 0,
  endPos: 7,
}

function CompletionNavigationHarness({
  updates,
}: {
  updates: Array<Partial<CompletionState>>
}): React.ReactNode {
  const [state, setState] = useState(() =>
    makeState({
      suggestions: [directorySuggestion],
      isActive: true,
      context: directoryContext,
    }),
  )

  const updateState = useCallback(
    (next: Partial<CompletionState>) => {
      updates.push(next)
      setState(prev => ({ ...prev, ...next }))
    },
    [updates],
  )

  const resetCompletion = useCallback(() => {
    setState(prev => ({
      ...prev,
      suggestions: [],
      selectedIndex: 0,
      isActive: false,
      context: null,
      preview: null,
      emptyDirMessage: '',
    }))
  }, [])

  useUnifiedCompletionNavigationKeys({
    input: '@empty/',
    state,
    resetCompletion,
    updateState,
    generateSuggestions: () => [],
    completeWith: () => {},
    activateCompletion: (suggestions, context) => {
      setState(prev => ({
        ...prev,
        suggestions,
        selectedIndex: 0,
        isActive: true,
        context,
        preview: null,
      }))
    },
    onInputChange: () => {},
    setCursorOffset: () => {},
    isEnabled: true,
  })

  return <Text>EMPTY:{state.emptyDirMessage}</Text>
}

describe('TUI E2E regression (Ink render): completion navigation', () => {
  test('clears delayed empty-directory updates when completion unmounts', async () => {
    const updates: Array<Partial<CompletionState>> = []
    const h = createInkTestHarness(
      <KeypressProvider>
        <CompletionNavigationHarness updates={updates} />
      </KeypressProvider>,
    )
    harnessManager.track(h)

    await h.wait(25)
    h.stdin.write('\u001b[C')
    await h.wait(100)

    expect(updates).toEqual([
      { emptyDirMessage: 'Directory is empty: empty/' },
    ])

    h.unmount()
    await h.wait(3200)

    expect(updates).toEqual([
      { emptyDirMessage: 'Directory is empty: empty/' },
    ])
  })
})
