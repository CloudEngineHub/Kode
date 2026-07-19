import { measureElement, type DOMElement } from 'ink'
import { useCallback, useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import {
  type TerminalMouseEvent,
  useKeypressContext,
} from '#ui-ink/contexts/KeypressContext'

export type { TerminalMouseEvent }

type MouseHandler = (
  event: TerminalMouseEvent,
) => boolean | void | Promise<void>

export function useMouse(
  onMouse: MouseHandler,
  { isActive, priority }: { isActive?: boolean; priority?: number } = {},
): void {
  const { subscribeMouse, unsubscribeMouse } = useKeypressContext()
  const active = isActive !== false
  const handlerRef = useRef(onMouse)
  handlerRef.current = onMouse

  const stableHandler = useCallback((event: TerminalMouseEvent) => {
    return handlerRef.current(event)
  }, [])

  useEffect(() => {
    if (!active) return
    subscribeMouse(stableHandler, { priority })
    return () => {
      unsubscribeMouse(stableHandler)
    }
  }, [active, stableHandler, subscribeMouse, unsubscribeMouse])

  useEffect(() => {
    if (!active) return
    // Update priority without toggling terminal mouse tracking.
    subscribeMouse(stableHandler, { priority })
  }, [active, priority, stableHandler, subscribeMouse])
}

function getNodeOffset(node: DOMElement): { left: number; top: number } {
  let left = 0
  let top = 0
  let current: DOMElement | undefined = node

  while (current) {
    const yogaNode = current.yogaNode
    left += yogaNode?.getComputedLeft?.() ?? 0
    top += yogaNode?.getComputedTop?.() ?? 0
    current = current.parentNode
  }

  return { left, top }
}

export function isMouseInsideElement(
  node: DOMElement | null,
  event: TerminalMouseEvent,
): boolean {
  if (!node) return false

  const { width, height } = measureElement(node)
  if (width <= 0 || height <= 0) return false

  const { left, top } = getNodeOffset(node)
  const x = event.x - 1
  const y = event.y - 1

  return x >= left && x < left + width && y >= top && y < top + height
}

export function useMousePress(
  ref: RefObject<DOMElement | null>,
  onPress: (event: TerminalMouseEvent) => void,
  { isActive, priority }: { isActive?: boolean; priority?: number } = {},
): void {
  useMouse(
    event => {
      if (event.type !== 'press' || event.button !== 'left') return
      if (!isMouseInsideElement(ref.current, event)) return

      onPress(event)
      return true
    },
    { isActive, priority },
  )
}

export function useMouseWheel(
  ref: RefObject<DOMElement | null>,
  onWheel: (direction: 'up' | 'down', event: TerminalMouseEvent) => void,
  { isActive, priority }: { isActive?: boolean; priority?: number } = {},
): void {
  useMouse(
    event => {
      if (event.type !== 'scroll') return
      if (event.button !== 'wheel-up' && event.button !== 'wheel-down') return
      if (!isMouseInsideElement(ref.current, event)) return

      onWheel(event.button === 'wheel-up' ? 'up' : 'down', event)
      return true
    },
    { isActive, priority },
  )
}
