import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { KEYPRESS_PRIORITY } from '#ui-ink/constants/keypressPriority'

import {
  isLoadingSuggestion,
  type CompletionContext,
  type UnifiedSuggestion,
} from '#cli-utils/completion/types'
import type { CompletionState } from './types'

function getPreviewText(
  suggestion: UnifiedSuggestion,
  context: CompletionContext,
): string {
  if (context.type === 'command') return `/${suggestion.value}`
  if (context.type === 'agent') return `@${suggestion.value}`
  if (suggestion.isSmartMatch) return `@${suggestion.value}`
  if (context.type === 'file' && context.trigger === '@') {
    return `@${suggestion.value}`
  }
  return suggestion.value
}

export function useUnifiedCompletionNavigationKeys(args: {
  input: string
  state: CompletionState
  resetCompletion: () => void
  updateState: (updates: Partial<CompletionState>) => void
  generateSuggestions: (context: CompletionContext) => UnifiedSuggestion[]
  completeWith: (
    suggestion: UnifiedSuggestion,
    context: CompletionContext,
  ) => void
  activateCompletion: (
    suggestions: UnifiedSuggestion[],
    context: CompletionContext,
  ) => void
  onInputChange: (value: string) => void
  setCursorOffset: (offset: number) => void
  isEnabled: boolean
}): void {
  useKeypress(
    (inputChar, key) => {
      if (!args.isEnabled) return false

      // When completion is active, don't let history navigation take over
      const preferHistoryNavigation =
        !args.state.isActive &&
        !args.input.includes('\n') &&
        !key.ctrl &&
        !key.meta

      if (preferHistoryNavigation && (key.upArrow || key.downArrow)) {
        return false
      }

      // Plain Enter keeps chat semantics: close completions and let TextInput
      // submit the current value on the same keypress.
      if (
        key.return &&
        !key.shift &&
        !key.meta &&
        args.state.isActive &&
        args.state.suggestions.length > 0
      ) {
        args.resetCompletion()
        return false
      }

      if (!args.state.isActive || args.state.suggestions.length === 0)
        return false

      const handleNavigation = (newIndex: number) => {
        if (!args.state.context) {
          args.updateState({ selectedIndex: newIndex })
          return
        }

        const suggestion = args.state.suggestions[newIndex]
        if (isLoadingSuggestion(suggestion)) {
          args.updateState({ selectedIndex: newIndex })
          return
        }
        const previewValue = getPreviewText(suggestion, args.state.context)

        if (args.state.preview?.isActive && args.state.context) {
          const newInput =
            args.input.slice(0, args.state.context.startPos) +
            previewValue +
            args.input.slice(args.state.preview.wordRange[1])

          args.onInputChange(newInput)
          args.setCursorOffset(
            args.state.context.startPos + previewValue.length,
          )

          args.updateState({
            selectedIndex: newIndex,
            preview: {
              ...args.state.preview,
              wordRange: [
                args.state.context.startPos,
                args.state.context.startPos + previewValue.length,
              ],
            },
          })
        } else {
          args.updateState({ selectedIndex: newIndex })
        }
      }

      const handleUp =
        key.upArrow || (key.ctrl && inputChar === 'p') ? true : false
      const handleDown =
        key.downArrow || (key.ctrl && inputChar === 'n') ? true : false

      if (handleDown) {
        const nextIndex =
          (args.state.selectedIndex + 1) % args.state.suggestions.length
        handleNavigation(nextIndex)
        return true
      }

      if (handleUp) {
        const nextIndex =
          args.state.selectedIndex === 0
            ? args.state.suggestions.length - 1
            : args.state.selectedIndex - 1
        handleNavigation(nextIndex)
        return true
      }

      if (inputChar === ' ') {
        args.resetCompletion()
        return false
      }

      if (key.rightArrow) {
        const selectedSuggestion =
          args.state.suggestions[args.state.selectedIndex]
        if (isLoadingSuggestion(selectedSuggestion)) return true

        const isDirectory = selectedSuggestion.value.endsWith('/')

        if (!args.state.context) return false

        args.completeWith(selectedSuggestion, args.state.context)

        args.resetCompletion()

        if (isDirectory) {
          setTimeout(() => {
            if (!args.state.context) return
            const inserted = getPreviewText(
              selectedSuggestion,
              args.state.context,
            )
            const nextEndPos = args.state.context.startPos + inserted.length
            const newContext: CompletionContext = {
              ...args.state.context,
              prefix: selectedSuggestion.value,
              endPos: nextEndPos,
            }

            const newSuggestions = args.generateSuggestions(newContext)

            if (newSuggestions.length > 0) {
              args.activateCompletion(newSuggestions, newContext)
            } else {
              args.updateState({
                emptyDirMessage: `Directory is empty: ${selectedSuggestion.value}`,
              })
              setTimeout(() => args.updateState({ emptyDirMessage: '' }), 3000)
            }
          }, 50)
        }

        return true
      }

      if (key.escape) {
        if (args.state.preview?.isActive && args.state.context) {
          args.onInputChange(args.state.preview.originalInput)
          args.setCursorOffset(
            args.state.context.startPos + args.state.context.prefix.length,
          )
        }

        args.resetCompletion()
        return true
      }

      return false
    },
    { priority: KEYPRESS_PRIORITY.COMPLETION },
  )

  useKeypress(
    (_inputChar, key) => {
      if (!args.isEnabled) return false
      if (key.backspace || key.delete) {
        if (args.state.isActive) {
          args.resetCompletion()
          const suppressionTime = args.input.length > 10 ? 200 : 100
          args.updateState({
            suppressUntil: Date.now() + suppressionTime,
          })
          // Don't consume: allow the input field to process the deletion.
          return false
        }
      }
      return false
    },
    { priority: KEYPRESS_PRIORITY.COMPLETION },
  )
}
