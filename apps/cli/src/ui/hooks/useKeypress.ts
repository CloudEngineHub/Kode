import { useCallback, useEffect, useRef } from 'react'
import type { Key } from '#ui-ink/contexts/KeypressContext'
import { useKeypressContext } from '#ui-ink/contexts/KeypressContext'

export type { Key }

export function useKeypress(
  onKeypress: (input: string, key: Key) => boolean | void | Promise<void>,
  { isActive, priority }: { isActive?: boolean; priority?: number } = {},
): void {
  const { subscribe, unsubscribe } = useKeypressContext()
  const active = isActive !== false

  const handlerRef = useRef(onKeypress)
  handlerRef.current = onKeypress

  const stableHandler = useCallback((input: string, key: Key) => {
    return handlerRef.current(input, key)
  }, [])

  useEffect(() => {
    if (!active) return
    subscribe(stableHandler, { priority })
    return () => {
      unsubscribe(stableHandler)
    }
  }, [active, stableHandler, subscribe, unsubscribe])

  useEffect(() => {
    if (!active) return
    // Update priority without resubscribing.
    subscribe(stableHandler, { priority })
  }, [active, priority, stableHandler, subscribe])
}
