import { useCallback } from 'react'

import type {
  CompletionContext,
  UnifiedSuggestion,
} from '#cli-utils/completion/types'

export function useCompletionActions(args: {
  input: string
  onInputChange: (value: string) => void
  setCursorOffset: (offset: number) => void
}): {
  completeWith: (
    suggestion: UnifiedSuggestion,
    context: CompletionContext,
  ) => void
  partialComplete: (prefix: string, context: CompletionContext) => void
} {
  const completeWith = useCallback(
    (suggestion: UnifiedSuggestion, context: CompletionContext) => {
      let completion: string

      if (context.type === 'command') {
        completion = `/${suggestion.value} `
      } else if (context.type === 'agent') {
        if (suggestion.type === 'agent' || suggestion.type === 'ask') {
          completion = `@${suggestion.value} `
        } else {
          const isDirectory = suggestion.value.endsWith('/')
          completion = `@${suggestion.value}${isDirectory ? '' : ' '}`
        }
      } else {
        if (suggestion.isSmartMatch) {
          completion = `@${suggestion.value} `
        } else {
          const isDirectory = suggestion.value.endsWith('/')
          const atPrefix = context.trigger === '@'
          completion = `${atPrefix ? '@' : ''}${suggestion.value}${
            isDirectory ? '' : ' '
          }`
        }
      }

      let actualEndPos: number

      if (
        context.type === 'file' &&
        suggestion.value.startsWith('/') &&
        !suggestion.isSmartMatch
      ) {
        let end = context.startPos
        while (
          end < args.input.length &&
          args.input[end] !== ' ' &&
          args.input[end] !== '\n'
        ) {
          end++
        }
        actualEndPos = end
      } else {
        const currentWord = args.input.slice(context.startPos)
        const nextSpaceIndex = currentWord.indexOf(' ')
        actualEndPos =
          nextSpaceIndex === -1
            ? args.input.length
            : context.startPos + nextSpaceIndex
      }

      const newInput =
        args.input.slice(0, context.startPos) +
        completion +
        args.input.slice(actualEndPos)
      args.onInputChange(newInput)
      args.setCursorOffset(context.startPos + completion.length)
    },
    [args],
  )

  const partialComplete = useCallback(
    (prefix: string, context: CompletionContext) => {
      const completion =
        context.type === 'command'
          ? `/${prefix}`
          : context.type === 'agent'
            ? `@${prefix}`
            : context.trigger === '@'
              ? `@${prefix}`
              : prefix

      const newInput =
        args.input.slice(0, context.startPos) +
        completion +
        args.input.slice(context.endPos)
      args.onInputChange(newInput)
      args.setCursorOffset(context.startPos + completion.length)
    },
    [args],
  )

  return { completeWith, partialComplete }
}
