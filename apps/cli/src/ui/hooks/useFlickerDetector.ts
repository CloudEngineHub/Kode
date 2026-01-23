import { type DOMElement, measureElement } from 'ink'
import { useCallback, useEffect, useRef } from 'react'
import { debug as debugLogger } from '#core/utils/debugLogger'

const MIN_MEASURE_INTERVAL_MS = 100

/**
 * Debug-only hook that detects when the UI renders taller than the terminal.
 * This is a strong signal of a viewport sizing bug that causes scroll/flicker.
 *
 * Enable with `KODE_DEBUG_FLICKER=1` or by passing `enabled=true`.
 */
export function useFlickerDetector(
  rootUiRef: React.RefObject<DOMElement | null>,
  terminalHeight: number,
  enabled: boolean,
): void {
  const lastMeasureRef = useRef(0)

  useEffect(() => {
    if (!enabled) return
    if (!rootUiRef.current) return
    if (!Number.isFinite(terminalHeight) || terminalHeight <= 0) return

    const now = Date.now()
    if (now - lastMeasureRef.current < MIN_MEASURE_INTERVAL_MS) return
    lastMeasureRef.current = now

    const measurement = measureElement(rootUiRef.current)
    const isOverflowing = measurement.height > terminalHeight

    if (isOverflowing) {
      debugLogger.ui('FLICKER_DETECTED', {
        contentHeight: measurement.height,
        terminalHeight,
        timestamp: now,
      })
    }
  }, [enabled, rootUiRef, terminalHeight])
}

/**
 * Simpler version that just returns whether content is currently overflowing.
 * Use this for basic overflow prevention without history tracking.
 */
export function useIsOverflowing(
  rootUiRef: React.RefObject<DOMElement | null>,
  terminalHeight: number,
): boolean {
  const isOverflowingRef = useRef(false)
  const lastMeasureRef = useRef(0)

  useEffect(() => {
    if (!rootUiRef.current) return
    if (!Number.isFinite(terminalHeight) || terminalHeight <= 0) return

    const now = Date.now()
    if (now - lastMeasureRef.current < MIN_MEASURE_INTERVAL_MS) return
    lastMeasureRef.current = now

    const measurement = measureElement(rootUiRef.current)
    isOverflowingRef.current = measurement.height > terminalHeight
  })

  return isOverflowingRef.current
}

/**
 * Hook that provides a callback to check overflow on demand.
 * Useful for components that need to verify height before rendering.
 */
export function useOverflowCheck(
  rootUiRef: React.RefObject<DOMElement | null>,
  terminalHeight: number,
): () => boolean {
  return useCallback(() => {
    if (!rootUiRef.current) return false
    if (!Number.isFinite(terminalHeight) || terminalHeight <= 0) return false

    const measurement = measureElement(rootUiRef.current)
    return measurement.height > terminalHeight
  }, [rootUiRef, terminalHeight])
}
