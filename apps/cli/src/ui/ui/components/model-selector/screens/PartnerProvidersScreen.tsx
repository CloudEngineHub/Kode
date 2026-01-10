import React from 'react'
import { Box, Text } from 'ink'
import {
  ScreenContainer,
  type ScreenContainerExitState,
} from '../ScreenContainer'

type Option = { value: string; label: string }

type Props = {
  theme: any
  exitState: ScreenContainerExitState
  containerPaddingY: number
  containerGap: number
  compactLayout: boolean
  tightLayout: boolean
  partnerProviderOptions: Option[]
  partnerProviderFocusIndex: number
  partnerReservedLines: number
  getSafeVisibleOptionCount: (
    requestedCount: number,
    optionLength: number,
    reservedLines?: number,
  ) => number
  renderWindowedOptions: (
    options: Option[],
    focusedIndex: number,
    maxVisible: number,
  ) => React.ReactNode
}

export function PartnerProvidersScreen({
  theme,
  exitState,
  containerPaddingY,
  containerGap,
  compactLayout,
  tightLayout,
  partnerProviderOptions,
  partnerProviderFocusIndex,
  partnerReservedLines,
  getSafeVisibleOptionCount,
  renderWindowedOptions,
}: Props) {
  const footerMarginTop = tightLayout ? 0 : 1
  return (
    <ScreenContainer
      title="Partner Providers"
      exitState={exitState}
      paddingY={containerPaddingY}
      gap={containerGap}
    >
      <Box flexDirection="column" gap={containerGap}>
        <Text bold>Select a partner AI provider for this model profile:</Text>
        <Box flexDirection="column" width="100%">
          <Text color={theme.secondaryText}>
            {compactLayout
              ? 'Choose an official partner provider.'
              : 'Choose from official partner providers to access their models and services.'}
          </Text>
        </Box>

        {renderWindowedOptions(
          partnerProviderOptions,
          partnerProviderFocusIndex,
          getSafeVisibleOptionCount(
            6,
            partnerProviderOptions.length,
            partnerReservedLines,
          ),
        )}

        <Box marginTop={footerMarginTop}>
          <Text dimColor>
            Press <Text color={theme.suggestion}>Esc</Text> to go back to main menu
          </Text>
        </Box>
      </Box>
    </ScreenContainer>
  )
}
