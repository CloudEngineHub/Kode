import * as React from 'react'
import { useCallback, useMemo, useRef, useState } from 'react'

export type TransientViewportConstraints = {
  /**
   * Maximum number of rows transient (actively changing) transcript content
   * should occupy. When undefined, components should fall back to their own
   * defaults.
   */
  maxHeight?: number

  /**
   * When true, components should actively constrain their height to prevent
   * content overflow that causes flickering. When false, overflow is allowed
   * (e.g., during transitions or when intentionally exceeding bounds).
   */
  constrainHeight?: boolean

  /**
   * Report that content would overflow the viewport.
   * Used for telemetry and debugging flickering issues.
   */
  reportOverflow?: (actualHeight: number) => void
}

const TransientViewportContext =
  React.createContext<TransientViewportConstraints>({})

export function TransientViewportProvider({
  value,
  children,
}: {
  value: TransientViewportConstraints
  children: React.ReactNode
}): React.ReactNode {
  return (
    <TransientViewportContext.Provider value={value}>
      {children}
    </TransientViewportContext.Provider>
  )
}

export function useTransientViewport(): TransientViewportConstraints {
  return React.useContext(TransientViewportContext)
}

/**
 * Hook for components that need to track and report overflow.
 * Returns a ref callback and the effective max height to use.
 */
export function useConstrainedHeight(defaultMaxHeight?: number): {
  effectiveMaxHeight: number | undefined
  shouldConstrain: boolean
} {
  const { maxHeight, constrainHeight } = useTransientViewport()

  return useMemo(
    () => ({
      effectiveMaxHeight: maxHeight ?? defaultMaxHeight,
      shouldConstrain: constrainHeight ?? true,
    }),
    [maxHeight, defaultMaxHeight, constrainHeight],
  )
}

/**
 * Enhanced provider that includes overflow tracking.
 */
export function TransientViewportProviderWithTracking({
  maxHeight,
  constrainHeight = true,
  onOverflow,
  children,
}: {
  maxHeight: number
  constrainHeight?: boolean
  onOverflow?: (actualHeight: number) => void
  children: React.ReactNode
}): React.ReactNode {
  const lastOverflowRef = useRef(0)
  const OVERFLOW_THROTTLE_MS = 200

  const reportOverflow = useCallback(
    (actualHeight: number) => {
      const now = Date.now()
      if (now - lastOverflowRef.current < OVERFLOW_THROTTLE_MS) return
      lastOverflowRef.current = now
      onOverflow?.(actualHeight)
    },
    [onOverflow],
  )

  const value = useMemo<TransientViewportConstraints>(
    () => ({
      maxHeight,
      constrainHeight,
      reportOverflow,
    }),
    [maxHeight, constrainHeight, reportOverflow],
  )

  return (
    <TransientViewportContext.Provider value={value}>
      {children}
    </TransientViewportContext.Provider>
  )
}
