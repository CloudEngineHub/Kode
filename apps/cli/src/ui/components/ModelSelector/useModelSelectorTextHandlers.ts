import type { ModelSelectorState } from './useModelSelectorState'
import { useCallback, useEffect, useRef } from 'react'

export function useModelSelectorTextHandlers(state: ModelSelectorState) {
  const cleanedNotificationTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null)

  useEffect(() => {
    return () => {
      if (cleanedNotificationTimeoutRef.current) {
        clearTimeout(cleanedNotificationTimeoutRef.current)
      }
    }
  }, [])

  const scheduleCleanedNotificationClear = useCallback(() => {
    if (cleanedNotificationTimeoutRef.current) {
      clearTimeout(cleanedNotificationTimeoutRef.current)
    }
    cleanedNotificationTimeoutRef.current = setTimeout(() => {
      cleanedNotificationTimeoutRef.current = null
      state.setApiKeyCleanedNotification(false)
    }, 3000)
  }, [state.setApiKeyCleanedNotification])

  function handleCursorOffsetChange(offset: number) {
    state.setCursorOffset(offset)
  }

  function formatApiKeyDisplay(key: string): string {
    if (!key) return ''
    if (key.length <= 10) return '*'.repeat(key.length)

    const prefix = key.slice(0, 4)
    const suffix = key.slice(-4)
    return `${prefix}***${suffix}`
  }

  function handleApiKeyChange(value: string) {
    state.setApiKeyEdited(true)
    // API keys should not contain whitespace. Remove spaces/newlines introduced by
    // terminal wrapping, copy/paste formatting, or legacy paste behavior.
    const cleanedValue = value.replace(/\s+/g, '').trim()

    if (value !== cleanedValue && value.length > 0) {
      state.setApiKeyCleanedNotification(true)
      scheduleCleanedNotificationClear()
    }

    state.setApiKey(cleanedValue)
    state.setCursorOffset(cleanedValue.length)
  }

  function handleModelSearchChange(value: string) {
    state.setModelSearchQuery(value)
    state.setModelSearchCursorOffset(value.length)
  }

  function handleModelSearchCursorOffsetChange(offset: number) {
    state.setModelSearchCursorOffset(offset)
  }

  return {
    handleCursorOffsetChange,
    formatApiKeyDisplay,
    handleApiKeyChange,
    handleModelSearchChange,
    handleModelSearchCursorOffsetChange,
  }
}

export type ModelSelectorTextHandlers = ReturnType<
  typeof useModelSelectorTextHandlers
>
