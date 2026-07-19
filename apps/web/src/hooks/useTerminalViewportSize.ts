import React from 'react'

import {
  estimateTerminalViewportSize,
  isSameTerminalViewportSize,
  type TerminalViewportSize,
} from '../lib/terminalViewport'

export function useTerminalViewportSize(
  viewportRef: React.RefObject<HTMLElement | null>,
): TerminalViewportSize | null {
  const [viewportSize, setViewportSize] =
    React.useState<TerminalViewportSize | null>(null)

  React.useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || typeof window === 'undefined') return

    let animationFrame: number | null = null

    const updateViewportSize = () => {
      animationFrame = null
      const rect = viewport.getBoundingClientRect()
      const next = estimateTerminalViewportSize({
        width: rect.width,
        height: rect.height,
      })
      setViewportSize(current =>
        isSameTerminalViewportSize(current, next) ? current : next,
      )
    }

    const scheduleUpdate = () => {
      if (animationFrame !== null) return
      animationFrame = window.requestAnimationFrame(updateViewportSize)
    }

    scheduleUpdate()

    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(scheduleUpdate)
    resizeObserver?.observe(viewport)
    window.addEventListener('resize', scheduleUpdate, { passive: true })

    return () => {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame)
      }
      resizeObserver?.disconnect()
      window.removeEventListener('resize', scheduleUpdate)
    }
  }, [viewportRef])

  return viewportSize
}
