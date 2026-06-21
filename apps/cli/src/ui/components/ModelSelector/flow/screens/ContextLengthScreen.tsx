import React from 'react'
import { Box, Text } from 'ink'

import { DEFAULT_CONTEXT_LENGTH, type ContextLengthOption } from '../options'
import {
  ScreenFrame,
  type ScreenExitState,
} from '#ui-ink/primitives/layout/ScreenFrame'

type Props = {
  theme: any
  exitState: ScreenExitState
  compactLayout: boolean
  tightLayout: boolean
  containerPaddingY: number
  containerGap: number
  contextLength: number
  contextLengthOptions: ContextLengthOption[]
}

export function ContextLengthScreen({
  theme,
  exitState,
  compactLayout,
  tightLayout,
  containerPaddingY,
  containerGap,
  contextLength,
  contextLengthOptions,
}: Props) {
  const selectedOption =
    contextLengthOptions.find(opt => opt.value === contextLength) ||
    contextLengthOptions.find(opt => opt.value === DEFAULT_CONTEXT_LENGTH) ||
    contextLengthOptions[0]

  return (
    <ScreenFrame
      title="Context Length Configuration"
      exitState={exitState}
      paddingX={tightLayout || compactLayout ? 1 : 2}
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
          {contextLengthOptions.map(option => {
            const isSelected = option.value === contextLength
            return (
              <Box key={option.value} flexDirection="row">
                <Text color={isSelected ? 'blue' : undefined}>
                  {isSelected ? '→ ' : '  '}
                  {option.label}
                  {option.value === DEFAULT_CONTEXT_LENGTH
                    ? ' (recommended)'
                    : ''}
                </Text>
              </Box>
            )
          })}
        </Box>

        {!tightLayout && (
          <Text dimColor>
            Selected:{' '}
            <Text color={theme.suggestion}>{selectedOption.label}</Text>
          </Text>
        )}

        <Box marginTop={tightLayout ? 0 : 1}>
          <Text dimColor>
            ↑/↓ to select · Enter to continue · Esc to go back
          </Text>
        </Box>
      </Box>
    </ScreenFrame>
  )
}
