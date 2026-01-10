import { type DOMElement, measureElement } from 'ink'
import { useEffect, useRef, type RefObject } from 'react'
import { debug as debugLogger } from '#core/utils/debugLogger'

const MIN_MEASURE_INTERVAL_MS = 200

export function useFlickerDetector(
  rootUiRef: RefObject<DOMElement | null>,
  terminalHeight: number,
  isHeightConstrained: boolean,
): void {
  const lastMeasureRef = useRef(0)

  useEffect(() => {
    if (!isHeightConstrained) return
    if (!rootUiRef.current) return
    if (!Number.isFinite(terminalHeight) || terminalHeight <= 0) return

    const now = Date.now()
    if (now - lastMeasureRef.current < MIN_MEASURE_INTERVAL_MS) return
    lastMeasureRef.current = now

    const measurement = measureElement(rootUiRef.current)
    if (measurement.height > terminalHeight) {
      debugLogger.ui('FLICKER_DETECTED', {
        contentHeight: measurement.height,
        terminalHeight,
        timestamp: Date.now(),
      })
    }
  })
}
