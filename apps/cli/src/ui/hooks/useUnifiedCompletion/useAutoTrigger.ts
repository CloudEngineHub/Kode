import { useCallback, useEffect, useRef } from 'react'

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

  const shouldAutoHideSingleMatch = useCallback(
    (suggestion: UnifiedSuggestion, context: CompletionContext): boolean => {
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
    },
    [args.input],
  )

  useEffect(() => {
    if (lastInputRef.current === args.input) return
    if (!args.isEnabled) {
      if (args.state.isActive) {
        args.resetCompletion()
      }
      lastInputRef.current = args.input
      return
    }

    const now = Date.now()
    const timeSinceLastInput = now - lastInputTimeRef.current
    lastInputTimeRef.current = now

    // 检测可能的 IME 输入：快速连续的输入（< 150ms）
    // 这有助于减少中文输入时的补全面板闪烁
    const isPossiblyIMEInput =
      timeSinceLastInput > 0 && timeSinceLastInput < 150

    const inputLengthChange = Math.abs(
      args.input.length - lastInputRef.current.length,
    )
    const isHistoryNavigation =
      (inputLengthChange > 10 ||
        (inputLengthChange > 5 &&
          !args.input.includes(lastInputRef.current.slice(-5)))) &&
      args.input !== lastInputRef.current

    lastInputRef.current = args.input

    if (args.state.preview?.isActive || Date.now() < args.state.suppressUntil) {
      return
    }

    if (isHistoryNavigation && args.state.isActive) {
      args.resetCompletion()
      return
    }

    const context = args.getWordAtCursor()

    // 立即关闭补全面板如果 context 不存在但面板仍然激活
    // 这解决了删除 "/" 或 "@" 后补全面板不关闭的问题
    if (!context && args.state.isActive) {
      args.resetCompletion()
      return
    }

    // 如果可能是 IME 输入且面板未激活，暂时不触发补全
    // 这可以减少中文输入时的干扰
    if (isPossiblyIMEInput && !args.state.isActive) {
      return
    }

    if (context && shouldAutoTrigger(context)) {
      const newSuggestions = args.generateSuggestions(context)

      if (newSuggestions.length === 0) {
        args.resetCompletion()
      } else if (
        newSuggestions.length === 1 &&
        shouldAutoHideSingleMatch(newSuggestions[0], context)
      ) {
        args.resetCompletion()
      } else {
        args.activateCompletion(newSuggestions, context)
      }
    } else if (args.state.context) {
      const contextChanged =
        !context ||
        args.state.context.type !== context.type ||
        args.state.context.startPos !== context.startPos ||
        !context.prefix.startsWith(args.state.context.prefix)

      if (contextChanged) {
        args.resetCompletion()
      }
    }
  }, [args.input, args.cursorOffset, args.isEnabled, args.state.isActive])
}
