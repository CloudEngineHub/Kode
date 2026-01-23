import React from 'react'
import { Box, Text } from 'ink'
import { useTerminalSize } from '#ui-ink/hooks/useTerminalSize'
import { Divider } from '../components/Divider'

export type ScreenExitState = { pending: boolean; keyName: string }

const VIEWPORT_SAFE_MARGIN_ROWS = 1

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
  const frameHeight = Math.max(1, rows - VIEWPORT_SAFE_MARGIN_ROWS)

  return (
    <Box
      flexDirection="column"
      gap={gap}
      width={columns}
      height={frameHeight}
      paddingX={paddingX}
      paddingY={paddingY}
      overflow="hidden"
      flexShrink={0}
    >
      <Box flexDirection="column" flexShrink={0}>
        <Text bold color={titleColor}>
          {title}
        </Text>
        {exitState?.pending ? (
          <Text dimColor wrap="truncate-end">
            {`(press ${exitState.keyName} again to exit)`}
          </Text>
        ) : null}
      </Box>
      {showDivider ? (
        <Box flexShrink={0}>
          <Divider width={dividerWidth} />
        </Box>
      ) : null}
      <Box flexDirection="column" flexGrow={1} flexShrink={1} overflow="hidden">
        {children}
      </Box>
    </Box>
  )
}
