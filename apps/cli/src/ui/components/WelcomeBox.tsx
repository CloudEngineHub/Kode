import React from 'react'
import { Box, Text } from 'ink'
import { PRODUCT_NAME } from '#core/constants/product'
import { getTheme } from '#core/utils/theme'
import { MIN_LOGO_WIDTH } from '#ui-ink/components/Logo'

export function WelcomeBox(): React.ReactNode {
  const theme = getTheme()
  return (
    <Box paddingX={1} width={MIN_LOGO_WIDTH}>
      <Text>
        <Text color={theme.kode}>✻</Text> Welcome to{' '}
        <Text bold>{PRODUCT_NAME}</Text> research preview!
      </Text>
    </Box>
  )
}
