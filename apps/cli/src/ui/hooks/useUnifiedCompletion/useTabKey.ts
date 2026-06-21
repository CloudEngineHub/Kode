import { useKeypress, type Key } from '#ui-ink/hooks/useKeypress'
import { KEYPRESS_PRIORITY } from '#ui-ink/constants/keypressPriority'

import type {
  CompletionContext,
  UnifiedSuggestion,
} from '#cli-utils/completion/types'
import type { CompletionState } from './types'

export function __shouldHandleUnifiedCompletionTabKeyForTests(
  key: Key,
): boolean {
  return Boolean(key.tab) && !Boolean(key.shift)
}

export function useUnifiedCompletionTabKey(args: {
  input: string
  state: CompletionState
  getWordAtCursor: () => CompletionContext | null
  generateSuggestions: (context: CompletionContext) => UnifiedSuggestion[]
  completeWith: (
    suggestion: UnifiedSuggestion,
    context: CompletionContext,
  ) => void
  activateCompletion: (
    suggestions: UnifiedSuggestion[],
    context: CompletionContext,
  ) => void
  updateState: (updates: Partial<CompletionState>) => void
  onInputChange: (value: string) => void
  setCursorOffset: (offset: number) => void
  isEnabled: boolean
}): void {
  useKeypress(
    (_inputChar, key) => {
      if (!args.isEnabled) return false
      if (!__shouldHandleUnifiedCompletionTabKeyForTests(key)) return false

      const context = args.getWordAtCursor()
      if (!context) return false

      if (args.state.isActive && args.state.suggestions.length > 0) {
        const nextIndex =
          (args.state.selectedIndex + 1) % args.state.suggestions.length
        const nextSuggestion = args.state.suggestions[nextIndex]

        if (args.state.context) {
          const currentWord = args.input.slice(args.state.context.startPos)
          const wordEnd = currentWord.search(/\s/)
          const actualEndPos =
            wordEnd === -1
              ? args.input.length
              : args.state.context.startPos + wordEnd

          let preview: string
          if (args.state.context.type === 'command') {
            preview = `/${nextSuggestion.value}`
          } else if (args.state.context.type === 'agent') {
            preview = `@${nextSuggestion.value}`
          } else if (
            nextSuggestion.isSmartMatch ||
            args.state.context.trigger === '@'
          ) {
            preview = `@${nextSuggestion.value}`
          } else {
            preview = nextSuggestion.value
          }

          const newInput =
            args.input.slice(0, args.state.context.startPos) +
            preview +
            args.input.slice(actualEndPos)

          args.onInputChange(newInput)
          args.setCursorOffset(args.state.context.startPos + preview.length)

          args.updateState({
            selectedIndex: nextIndex,
            preview: {
              isActive: true,
              originalInput: args.input,
              wordRange: [
                args.state.context.startPos,
                args.state.context.startPos + preview.length,
              ],
            },
          })
        }
        return true
      }

      const currentSuggestions = args.generateSuggestions(context)

      if (currentSuggestions.length === 0) {
        return false
      }
      if (currentSuggestions.length === 1) {
        args.completeWith(currentSuggestions[0], context)
        return true
      }

      args.activateCompletion(currentSuggestions, context)

      const firstSuggestion = currentSuggestions[0]
      const currentWord = args.input.slice(context.startPos)
      const wordEnd = currentWord.search(/\s/)
      const actualEndPos =
        wordEnd === -1 ? args.input.length : context.startPos + wordEnd

      let preview: string
      if (context.type === 'command') {
        preview = `/${firstSuggestion.value}`
      } else if (context.type === 'agent') {
        preview = `@${firstSuggestion.value}`
      } else if (firstSuggestion.isSmartMatch || context.trigger === '@') {
        preview = `@${firstSuggestion.value}`
      } else {
        preview = firstSuggestion.value
      }

      const newInput =
        args.input.slice(0, context.startPos) +
        preview +
        args.input.slice(actualEndPos)
      args.onInputChange(newInput)
      args.setCursorOffset(context.startPos + preview.length)

      args.updateState({
        preview: {
          isActive: true,
          originalInput: args.input,
          wordRange: [context.startPos, context.startPos + preview.length],
        },
      })

      return true
    },
    { priority: KEYPRESS_PRIORITY.COMPLETION },
  )
}
