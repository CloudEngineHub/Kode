import { useCallback, useEffect, useState } from 'react'
import { getCwd } from '#core/utils/state'
import { getCompletionContext } from '#cli-utils/completion/context'
import { generateSuggestionsForContext } from '#cli-utils/completion/generateSuggestions'
import type {
  CompletionContext,
  UnifiedSuggestion,
} from '#cli-utils/completion/types'

import type { CompletionState, UnifiedCompletionProps } from './types'
import { INITIAL_STATE } from './types'
import { useAgentSuggestions } from './useAgentSuggestions'
import { useCompletionActions } from './actions'
import { useModelSuggestions } from './useModelSuggestions'
import { useSystemCommands } from './useSystemCommands'
import { useUnifiedCompletionAutoTrigger } from './useAutoTrigger'
import { useUnifiedCompletionTabKey } from './useTabKey'
import { useUnifiedCompletionNavigationKeys } from './useNavigationKeys'

export function __getCompletionContextForTests(args: {
  input: string
  cursorOffset: number
  disableSlashCommands?: boolean
}): CompletionContext | null {
  return getCompletionContext(args)
}

export function useUnifiedCompletion({
  input,
  cursorOffset,
  onInputChange,
  setCursorOffset,
  commands,
  disableSlashCommands = false,
  isEnabled = true,
}: UnifiedCompletionProps) {
  const [state, setState] = useState<CompletionState>(INITIAL_STATE)

  const updateState = useCallback((updates: Partial<CompletionState>) => {
    setState(prev => ({ ...prev, ...updates }))
  }, [])

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

  const activateCompletion = useCallback(
    (suggestions: UnifiedSuggestion[], context: CompletionContext) => {
      setState(prev => ({
        ...prev,
        suggestions,
        selectedIndex: 0,
        isActive: true,
        context,
        preview: null,
      }))
    },
    [],
  )

  const getWordAtCursor = useCallback((): CompletionContext | null => {
    return __getCompletionContextForTests({
      input,
      cursorOffset,
      disableSlashCommands,
    })
  }, [input, cursorOffset, disableSlashCommands])

  const { systemCommands, isLoadingCommands } = useSystemCommands()
  const agentSuggestions = useAgentSuggestions()
  const modelSuggestions = useModelSuggestions()

  const generateSuggestions = useCallback(
    (context: CompletionContext): UnifiedSuggestion[] =>
      generateSuggestionsForContext({
        context,
        commands,
        agentSuggestions,
        modelSuggestions,
        systemCommands,
        isLoadingCommands,
        cwd: getCwd(),
      }),
    [
      commands,
      agentSuggestions,
      modelSuggestions,
      systemCommands,
      isLoadingCommands,
    ],
  )

  const { completeWith } = useCompletionActions({
    input,
    onInputChange,
    setCursorOffset,
  })

  useEffect(() => {
    if (!isEnabled && state.isActive) {
      resetCompletion()
    }
  }, [isEnabled, resetCompletion, state.isActive])

  useUnifiedCompletionTabKey({
    input,
    state,
    getWordAtCursor,
    generateSuggestions,
    completeWith,
    activateCompletion,
    updateState,
    onInputChange,
    setCursorOffset,
    isEnabled,
  })

  useUnifiedCompletionNavigationKeys({
    input,
    state,
    resetCompletion,
    updateState,
    generateSuggestions,
    completeWith,
    activateCompletion,
    onInputChange,
    setCursorOffset,
    isEnabled,
  })

  useUnifiedCompletionAutoTrigger({
    input,
    cursorOffset,
    state,
    getWordAtCursor,
    generateSuggestions,
    activateCompletion,
    resetCompletion,
    isEnabled,
  })

  return {
    suggestions: state.suggestions,
    selectedIndex: state.selectedIndex,
    isActive: state.isActive && isEnabled,
    emptyDirMessage: state.emptyDirMessage,
    resetCompletion,
  }
}
