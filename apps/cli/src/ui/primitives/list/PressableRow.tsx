import React, { useRef, type ReactNode } from 'react'
import { Box, type BoxProps, type DOMElement } from 'ink'
import { useMousePress } from '#ui-ink/hooks/useMouse'

export function PressableRow({
  children,
  isActive = true,
  onPress,
  priority = 25,
  ...boxProps
}: Omit<BoxProps, 'children'> & {
  children: ReactNode
  isActive?: boolean
  onPress?: () => boolean | void
  priority?: number
}): React.ReactNode {
  const ref = useRef<DOMElement | null>(null)

  useMousePress(
    ref,
    () => {
      onPress?.()
    },
    { isActive: isActive && onPress !== undefined, priority },
  )

  return (
    <Box ref={ref} {...boxProps}>
      {children}
    </Box>
  )
}
