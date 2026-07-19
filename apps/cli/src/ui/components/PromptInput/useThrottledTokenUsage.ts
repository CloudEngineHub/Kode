import { useEffect, useRef, useState } from 'react'
import type { Message } from '#core/query'
import {
  estimateTokensIncremental,
  type IncrementalTokenEstimateCache,
} from '#core/utils/tokens'

export const TOKEN_USAGE_UPDATE_INTERVAL_MS = 500

export function useThrottledTokenUsage(
  messages: Message[],
  intervalMs = TOKEN_USAGE_UPDATE_INTERVAL_MS,
): number {
  const cacheRef = useRef<IncrementalTokenEstimateCache | null>(null)
  const latestMessagesRef = useRef(messages)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didMountRef = useRef(false)
  const [tokenUsage, setTokenUsage] = useState(() => {
    const initial = estimateTokensIncremental({
      messages,
      previous: null,
    })
    cacheRef.current = initial
    return initial.totalTokens
  })

  useEffect(() => {
    latestMessagesRef.current = messages
    if (!didMountRef.current) {
      didMountRef.current = true
      return
    }

    if (timeoutRef.current) return

    timeoutRef.current = setTimeout(
      () => {
        timeoutRef.current = null
        const next = estimateTokensIncremental({
          messages: latestMessagesRef.current,
          previous: cacheRef.current,
        })
        cacheRef.current = next
        setTokenUsage(prev =>
          prev === next.totalTokens ? prev : next.totalTokens,
        )
      },
      Math.max(0, intervalMs),
    )
  }, [intervalMs, messages])

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [])

  return tokenUsage
}
