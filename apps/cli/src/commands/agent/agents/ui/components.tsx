import React from 'react'
import { Box, Text } from 'ink'
import { getTheme } from '#core/utils/theme'
import { Divider } from '#ui-ink/primitives/components/Divider'
import { useScreenLayout } from '#ui-ink/primitives/layout/useScreenLayout'

export function Panel(props: {
  title: string
  subtitle?: string
  titleColor?: string
  children?: React.ReactNode
}) {
  const theme = getTheme()
  const layout = useScreenLayout()
  const dividerWidth = Math.max(1, layout.columns - layout.paddingX * 2)
  return (
    <Box flexDirection="column" width="100%">
      <Box
        flexDirection="column"
        paddingX={layout.paddingX}
        paddingTop={layout.paddingY}
      >
        <Text bold color={props.titleColor ?? theme.text}>
          {props.title}
        </Text>
        {props.subtitle ? (
          <Text dimColor wrap="truncate-end">
            {props.subtitle}
          </Text>
        ) : null}
      </Box>
      <Box paddingX={layout.paddingX}>
        <Divider width={dividerWidth} />
      </Box>
      <Box
        paddingX={layout.paddingX}
        paddingBottom={layout.paddingY}
        flexDirection="column"
      >
        {props.children}
      </Box>
    </Box>
  )
}

export function Instructions({
  instructions = 'Press Up/Down to navigate - Enter to select - Esc to go back',
}: {
  instructions?: string
}) {
  return (
    <Box marginLeft={3}>
      <Text dimColor>{instructions}</Text>
    </Box>
  )
}
