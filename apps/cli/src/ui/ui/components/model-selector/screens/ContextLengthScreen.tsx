import React from 'react'
import { Box, Text } from 'ink'

import { CONTEXT_LENGTH_OPTIONS, DEFAULT_CONTEXT_LENGTH } from '../options'
import {
  ScreenContainer,
  type ScreenContainerExitState,
} from '../ScreenContainer'

type Props = {
  theme: any
  exitState: ScreenContainerExitState
  compactLayout: boolean
  tightLayout: boolean
  containerPaddingY: number
  containerGap: number
  contextLength: number
}

export function ContextLengthScreen({
  theme,
  exitState,
  compactLayout,
  tightLayout,
  containerPaddingY,
  containerGap,
  contextLength,
}: Props) {
  const selectedOption =
    CONTEXT_LENGTH_OPTIONS.find(opt => opt.value === contextLength) ||
    CONTEXT_LENGTH_OPTIONS[2] // Default to 128K

  return (
    <ScreenContainer
      title="Context Length Configuration"
      exitState={exitState}
      paddingY={containerPaddingY}
      gap={containerGap}
    >
      <Box flexDirection="column" gap={containerGap}>
        <Text bold>Choose the context window length for your model:</Text>
        {!tightLayout && (
          <Text color={theme.secondaryText}>
            {compactLayout
              ? 'Controls how much history the model can process.'
              : 'This determines how much conversation history and context the model can process at once. Higher values allow for longer conversations but may increase costs.'}
          </Text>
        )}

        <Box flexDirection="column" marginY={tightLayout ? 0 : 1}>
          {CONTEXT_LENGTH_OPTIONS.map(option => {
            const isSelected = option.value === contextLength
            return (
              <Box key={option.value} flexDirection="row">
                <Text color={isSelected ? 'blue' : undefined}>
                  {isSelected ? '→ ' : '  '}
                  {option.label}
                  {option.value === DEFAULT_CONTEXT_LENGTH ? ' (recommended)' : ''}
                </Text>
              </Box>
            )
          })}
        </Box>

        {!tightLayout && (
          <Text dimColor>
            Selected: <Text color={theme.suggestion}>{selectedOption.label}</Text>
          </Text>
        )}

        <Box marginTop={tightLayout ? 0 : 1}>
          <Text dimColor>↑/↓ to select · Enter to continue · Esc to go back</Text>
        </Box>
      </Box>
    </ScreenContainer>
  )
}
