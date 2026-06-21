import React from 'react'
import { Box, Newline, Text } from 'ink'
import {
  ScreenFrame,
  type ScreenExitState,
} from '#ui-ink/primitives/layout/ScreenFrame'

type Option = { value: string; label: string }
type WindowedOptionsLayout = {
  visibleOptionCount: number
  showIndicators: boolean
}

type Props = {
  theme: any
  exitState: ScreenExitState
  containerPaddingY: number
  containerGap: number
  tightLayout: boolean
  compactLayout: boolean
  codingPlanOptions: Option[]
  codingPlanFocusIndex: number
  codingReservedLines: number
  getWindowedOptionsLayout: (
    requestedCount: number,
    optionLength: number,
    reservedLines?: number,
  ) => WindowedOptionsLayout
  renderWindowedOptions: (
    options: Option[],
    focusedIndex: number,
    layout: WindowedOptionsLayout,
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
  getWindowedOptionsLayout,
  renderWindowedOptions,
}: Props) {
  const footerMarginTop = tightLayout ? 0 : 1
  return (
    <ScreenFrame
      title="Some Coding Plans"
      exitState={exitState}
      paddingX={tightLayout || compactLayout ? 1 : 2}
      paddingY={containerPaddingY}
      gap={containerGap}
    >
      <Box flexDirection="column" gap={containerGap}>
        <Text bold wrap="truncate-end">
          Select a partner coding plan for specialized programming assistance:
        </Text>
        <Box flexDirection="column" width="100%">
          <Text color={theme.secondaryText} wrap="truncate-end">
            {compactLayout ? (
              'Specialized coding models from partners.'
            ) : (
              <>
                These are specialized models optimized for coding and
                development tasks.
                <Newline />
                They require specific coding plan subscriptions from the
                respective providers.
              </>
            )}
          </Text>
        </Box>

        {renderWindowedOptions(
          codingPlanOptions,
          codingPlanFocusIndex,
          getWindowedOptionsLayout(
            5,
            codingPlanOptions.length,
            codingReservedLines,
          ),
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
