import React from 'react'
import { Text } from 'ink'
import { getTheme } from '#core/utils/theme'
import { useTerminalSize } from '#ui-ink/hooks/useTerminalSize'

export function Divider({
  width,
  inset = 0,
  char = '─',
  dim = true,
  color,
}: {
  width?: number
  inset?: number
  char?: string
  dim?: boolean
  color?: string
}): React.ReactNode {
  const { columns } = useTerminalSize()
  const theme = getTheme()
  const targetWidth = Math.max(1, (width ?? columns) - inset)
  return (
    <Text color={color ?? theme.secondaryBorder} dimColor={dim}>
      {char.repeat(targetWidth)}
    </Text>
  )
}
