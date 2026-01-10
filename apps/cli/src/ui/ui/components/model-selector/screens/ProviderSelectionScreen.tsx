import React from 'react'
import { Box, Newline, Text } from 'ink'

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
  mainMenuOptions: Option[]
  providerFocusIndex: number
  providerReservedLines: number
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

export function ProviderSelectionScreen({
  theme,
  exitState,
  containerPaddingY,
  containerGap,
  compactLayout,
  tightLayout,
  mainMenuOptions,
  providerFocusIndex,
  providerReservedLines,
  getSafeVisibleOptionCount,
  renderWindowedOptions,
}: Props) {
  return (
    <ScreenContainer
      title="Provider Selection"
      exitState={exitState}
      paddingY={containerPaddingY}
      gap={containerGap}
      children={
        <Box flexDirection="column" gap={containerGap}>
          <Text bold>
            Select your preferred AI provider for this model profile:
          </Text>
          <Box flexDirection="column" width="100%">
            <Text color={theme.secondaryText}>
              {compactLayout ? (
                'Choose the provider to use for this profile.'
              ) : (
                <>
                  Choose the provider you want to use for this model profile.
                  <Newline />
                  This will determine which models are available to you.
                </>
              )}
            </Text>
          </Box>

          {renderWindowedOptions(
            mainMenuOptions,
            providerFocusIndex,
            getSafeVisibleOptionCount(
              5,
              mainMenuOptions.length,
              providerReservedLines,
            ),
          )}

          <Box marginTop={tightLayout ? 0 : 1}>
            <Text dimColor>
              You can change this later by running{' '}
              <Text color={theme.suggestion}>/model</Text> again
            </Text>
          </Box>
        </Box>
      }
    />
  )
}
