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
  tightLayout: boolean
  compactLayout: boolean
  codingPlanOptions: Option[]
  codingPlanFocusIndex: number
  codingReservedLines: number
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

export function PartnerCodingPlansScreen({
  theme,
  exitState,
  containerPaddingY,
  containerGap,
  tightLayout,
  compactLayout,
  codingPlanOptions,
  codingPlanFocusIndex,
  codingReservedLines,
  getSafeVisibleOptionCount,
  renderWindowedOptions,
}: Props) {
  const footerMarginTop = tightLayout ? 0 : 1
  return (
    <ScreenContainer
      title="Partner Coding Plans"
      exitState={exitState}
      paddingY={containerPaddingY}
      gap={containerGap}
    >
      <Box flexDirection="column" gap={containerGap}>
        <Text bold>
          Select a partner coding plan for specialized programming assistance:
        </Text>
        <Box flexDirection="column" width="100%">
          <Text color={theme.secondaryText}>
            {compactLayout ? (
              'Specialized coding models from partners.'
            ) : (
              <>
                These are specialized models optimized for coding and development tasks.
                <Newline />
                They require specific coding plan subscriptions from the respective providers.
              </>
            )}
          </Text>
        </Box>

        {renderWindowedOptions(
          codingPlanOptions,
          codingPlanFocusIndex,
          getSafeVisibleOptionCount(
            5,
            codingPlanOptions.length,
            codingReservedLines,
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
