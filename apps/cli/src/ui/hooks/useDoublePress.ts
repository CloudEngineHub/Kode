// Creates a function that calls one function on the first call and another
// function on the second call within a certain timeout

import { useCallback, useEffect, useRef } from 'react'

export const DOUBLE_PRESS_TIMEOUT_MS = 2000

export function useDoublePress(
  setPending: (pending: boolean) => void,
  onDoublePress: () => void,
  onFirstPress?: () => void,
): () => void {
  const lastPressRef = useRef<number>(0)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )
  const setPendingRef = useRef(setPending)
  const onDoublePressRef = useRef(onDoublePress)
  const onFirstPressRef = useRef(onFirstPress)

  setPendingRef.current = setPending
  onDoublePressRef.current = onDoublePress
  onFirstPressRef.current = onFirstPress

  const clearPendingTimer = useCallback(() => {
    if (!timeoutRef.current) return
    clearTimeout(timeoutRef.current)
    timeoutRef.current = undefined
  }, [])

  useEffect(() => clearPendingTimer, [clearPendingTimer])

  return useCallback(() => {
    const now = Date.now()
    const timeSinceLastPress = now - lastPressRef.current

    // For this to count as a double-call, be sure to check that
    // timeoutRef.current exists so we don't trigger on triple call
    // (e.g. of Esc to clear the text input)
    if (timeSinceLastPress <= DOUBLE_PRESS_TIMEOUT_MS && timeoutRef.current) {
      clearPendingTimer()
      onDoublePressRef.current()
      setPendingRef.current(false)
    } else {
      clearPendingTimer()
      onFirstPressRef.current?.()
      setPendingRef.current(true)
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = undefined
        setPendingRef.current(false)
      }, DOUBLE_PRESS_TIMEOUT_MS)
    }

    lastPressRef.current = now
  }, [clearPendingTimer])
}
