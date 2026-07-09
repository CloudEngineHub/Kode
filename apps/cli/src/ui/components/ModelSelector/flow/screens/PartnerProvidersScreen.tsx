import React from 'react'
import { Box, Text } from 'ink'
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
  partnerProviderOptions: Option[]
  partnerProviderFocusIndex: number
  partnerReservedLines: number
  onPartnerProviderOptionPress: (optionIndex: number) => void
  onPartnerProviderOptionWheel: (direction: 'up' | 'down') => void
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
  onPartnerProviderOptionPress,
  onPartnerProviderOptionWheel,
  getWindowedOptionsLayout,
  renderWindowedOptions,
}: Props) {
  const footerMarginTop = tightLayout ? 0 : 1
  return (
    <ScreenFrame
      title="Other Providers"
      exitState={exitState}
      paddingX={tightLayout || compactLayout ? 1 : 2}
      paddingY={containerPaddingY}
      gap={containerGap}
    >
      <Box flexDirection="column" gap={containerGap}>
        <Text bold wrap="truncate-end">
          Select a partner AI provider for this model profile:
        </Text>
        <Box flexDirection="column" width="100%">
          <Text color={theme.secondaryText} wrap="truncate-end">
            {compactLayout
              ? 'Choose an official partner provider.'
              : 'Choose from official partner providers to access their models and services.'}
          </Text>
        </Box>

        {renderWindowedOptions(
          partnerProviderOptions,
          partnerProviderFocusIndex,
          getWindowedOptionsLayout(
            6,
            partnerProviderOptions.length,
            partnerReservedLines,
          ),
          {
            onOptionPress: onPartnerProviderOptionPress,
            onWheel: onPartnerProviderOptionWheel,
          },
        )}

        <Box marginTop={footerMarginTop}>
          <Text dimColor wrap="truncate-end">
            ↑/↓ or j/k · PgUp/PgDn · Home/End · Enter confirm · Esc back
          </Text>
        </Box>
      </Box>
    </ScreenFrame>
  )
}
