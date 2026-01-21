import React from 'react'
import { Box, Text } from 'ink'
import { useTerminalSize } from '#ui-ink/hooks/useTerminalSize'
import { Divider } from '../components/Divider'

export type ScreenExitState = { pending: boolean; keyName: string }

export function ScreenFrame({
  title,
  titleColor,
  exitState,
  paddingX = 1,
  paddingY = 1,
  gap = 1,
  showDivider = true,
  children,
}: {
  title: string
  titleColor?: string
  exitState?: ScreenExitState
  paddingX?: number
  paddingY?: number
  gap?: number
  showDivider?: boolean
  children: React.ReactNode
}): React.ReactNode {
  const { columns, rows } = useTerminalSize()
  const dividerWidth = Math.max(1, columns - paddingX * 2)

  return (
    <Box
      flexDirection="column"
      gap={gap}
      width={columns}
      height={rows}
      paddingX={paddingX}
      paddingY={paddingY}
      overflow="hidden"
    >
      <Box flexDirection="column">
        <Text bold color={titleColor}>
          {title}
        </Text>
        {exitState?.pending ? (
          <Text dimColor wrap="truncate-end">
            {`(press ${exitState.keyName} again to exit)`}
          </Text>
        ) : null}
      </Box>
      {showDivider ? <Divider width={dividerWidth} /> : null}
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {children}
      </Box>
    </Box>
  )
}
