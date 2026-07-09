import React from 'react'
import { Box, Newline, Text } from 'ink'

import {
  ScreenFrame,
  type ScreenExitState,
} from '#ui-ink/primitives/layout/ScreenFrame'
import type { Option, WindowedOptionInteractions } from '../../viewTypes'

type WindowedOptionsLayout = {
  visibleOptionCount: number
  showIndicators: boolean
}

type Props = {
  theme: any
  exitState: ScreenExitState
  containerPaddingY: number
  containerGap: number
  compactLayout: boolean
  tightLayout: boolean
  mainMenuOptions: Option[]
  providerFocusIndex: number
  providerReservedLines: number
  onProviderOptionPress: (optionIndex: number) => void
  onProviderOptionWheel: (direction: 'up' | 'down') => void
  getWindowedOptionsLayout: (
    requestedCount: number,
    optionLength: number,
    reservedLines?: number,
  ) => WindowedOptionsLayout
  renderWindowedOptions: (
    options: Option[],
    focusedIndex: number,
    layout: WindowedOptionsLayout,
    interactions?: WindowedOptionInteractions,
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
  onProviderOptionPress,
  onProviderOptionWheel,
  getWindowedOptionsLayout,
  renderWindowedOptions,
}: Props) {
  return (
    <ScreenFrame
      title="Provider Selection"
      exitState={exitState}
      paddingX={tightLayout || compactLayout ? 1 : 2}
      paddingY={containerPaddingY}
      gap={containerGap}
    >
      <Box flexDirection="column" gap={containerGap}>
        <Text bold wrap="truncate-end">
          Select your preferred AI provider for this model profile:
        </Text>
        <Box flexDirection="column" width="100%">
          <Text color={theme.secondaryText} wrap="truncate-end">
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
          getWindowedOptionsLayout(
            5,
            mainMenuOptions.length,
            providerReservedLines,
          ),
          {
            onOptionPress: onProviderOptionPress,
            onWheel: onProviderOptionWheel,
          },
        )}

        <Box marginTop={tightLayout ? 0 : 1}>
          <Text dimColor wrap="truncate-end">
            ↑/↓ or j/k · PgUp/PgDn · Home/End · Enter confirm · Esc exit ·{' '}
            <Text color={theme.suggestion}>/model</Text>
          </Text>
        </Box>
      </Box>
    </ScreenFrame>
  )
}
