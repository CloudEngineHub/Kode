import { useEffect, useRef } from 'react'

import type {
  CompletionContext,
  UnifiedSuggestion,
} from '#cli-utils/completion/types'
import type { CompletionState } from './types'

function shouldAutoTrigger(context: CompletionContext): boolean {
  switch (context.type) {
    case 'command':
    case 'agent':
      return true
    case 'file': {
      const prefix = context.prefix
      if (
        prefix.startsWith('./') ||
        prefix.startsWith('../') ||
        prefix.startsWith('/') ||
        prefix.startsWith('~') ||
        prefix.includes('/')
      ) {
        return true
      }
      if (prefix.startsWith('.') && prefix.length >= 2) {
        return true
      }
      return false
    }
    default:
      return false
  }
}

export function __computeAutoTriggerActionForTests(args: {
  input: string
  previousInput: string
  now: number
  lastInputTime: number
  isEnabled: boolean
  state: CompletionState
  context: CompletionContext | null
  generateSuggestions: (context: CompletionContext) => UnifiedSuggestion[]
}): {
  nextLastInput: string
  nextLastInputTime: number
  action: 'none' | 'reset' | 'activate'
  suggestions?: UnifiedSuggestion[]
  context?: CompletionContext
} {
  if (args.previousInput === args.input) {
    return {
      nextLastInput: args.previousInput,
      nextLastInputTime: args.lastInputTime,
      action: 'none',
    }
  }

  if (!args.isEnabled) {
    return {
      nextLastInput: args.input,
      nextLastInputTime: args.lastInputTime,
      action: args.state.isActive ? 'reset' : 'none',
    }
  }

  const timeSinceLastInput = args.now - args.lastInputTime
  const isPossiblyIMEInput = timeSinceLastInput > 0 && timeSinceLastInput < 150

  const inputLengthChange = Math.abs(
    args.input.length - args.previousInput.length,
  )
  const isHistoryNavigation =
    (inputLengthChange > 10 ||
      (inputLengthChange > 5 &&
        !args.input.includes(args.previousInput.slice(-5)))) &&
    args.input !== args.previousInput

  const shouldAutoHideSingleMatch = (
    suggestion: UnifiedSuggestion,
    context: CompletionContext,
  ): boolean => {
    const currentInput = args.input.slice(context.startPos, context.endPos)

    if (context.type === 'file') {
      if (suggestion.value.endsWith('/')) return false
      if (currentInput === suggestion.value) return true
      if (
        currentInput.endsWith('/' + suggestion.value) ||
        currentInput.endsWith(suggestion.value)
      ) {
        return true
      }
      return false
    }

    if (context.type === 'command') {
      return currentInput === `/${suggestion.value}`
    }

    if (context.type === 'agent') {
      return currentInput === `@${suggestion.value}`
    }

    return false
  }

  const nextLastInputTime = args.now
  const nextLastInput = args.input

  if (args.state.preview?.isActive || args.now < args.state.suppressUntil) {
    return { nextLastInput, nextLastInputTime, action: 'none' }
  }

  if (isHistoryNavigation && args.state.isActive) {
    return { nextLastInput, nextLastInputTime, action: 'reset' }
  }

  // 立即关闭补全面板如果 context 不存在但面板仍然激活
  // 这解决了删除 "/" 或 "@" 后补全面板不关闭的问题
  if (!args.context && args.state.isActive) {
    return { nextLastInput, nextLastInputTime, action: 'reset' }
  }

  // 如果可能是 IME 输入且面板未激活，暂时不触发补全
  // 这可以减少中文输入时的干扰
  if (isPossiblyIMEInput && !args.state.isActive) {
    return { nextLastInput, nextLastInputTime, action: 'none' }
  }

  if (args.context && shouldAutoTrigger(args.context)) {
    const newSuggestions = args.generateSuggestions(args.context)

    if (newSuggestions.length === 0) {
      return { nextLastInput, nextLastInputTime, action: 'reset' }
    }

    if (
      newSuggestions.length === 1 &&
      shouldAutoHideSingleMatch(newSuggestions[0], args.context)
    ) {
      return { nextLastInput, nextLastInputTime, action: 'reset' }
    }

    return {
      nextLastInput,
      nextLastInputTime,
      action: 'activate',
      suggestions: newSuggestions,
      context: args.context,
    }
  }

  if (args.state.context) {
    const current = args.context
    const previous = args.state.context
    const contextChanged =
      !current ||
      previous.type !== current.type ||
      previous.startPos !== current.startPos ||
      !current.prefix.startsWith(previous.prefix)

    if (contextChanged) {
      return { nextLastInput, nextLastInputTime, action: 'reset' }
    }
  }

  return { nextLastInput, nextLastInputTime, action: 'none' }
}

export function useUnifiedCompletionAutoTrigger(args: {
  input: string
  cursorOffset: number
  state: CompletionState
  getWordAtCursor: () => CompletionContext | null
  generateSuggestions: (context: CompletionContext) => UnifiedSuggestion[]
  activateCompletion: (
    suggestions: UnifiedSuggestion[],
    context: CompletionContext,
  ) => void
  resetCompletion: () => void
  isEnabled: boolean
}): void {
  const lastInputRef = useRef('')
  const lastInputTimeRef = useRef(0)

  useEffect(() => {
    const now = Date.now()
    const context = args.getWordAtCursor()
    const result = __computeAutoTriggerActionForTests({
      input: args.input,
      previousInput: lastInputRef.current,
      now,
      lastInputTime: lastInputTimeRef.current,
      isEnabled: args.isEnabled,
      state: args.state,
      context,
      generateSuggestions: args.generateSuggestions,
    })

    lastInputRef.current = result.nextLastInput
    lastInputTimeRef.current = result.nextLastInputTime

    if (result.action === 'reset') {
      args.resetCompletion()
      return
    }

    if (result.action === 'activate' && result.suggestions && result.context) {
      args.activateCompletion(result.suggestions, result.context)
    }
  }, [args.input, args.cursorOffset, args.isEnabled, args.state.isActive])
}
