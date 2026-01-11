import React from 'react'
import { Box, Text } from 'ink'

import { Select } from '#ui-ink/components/CustomSelect/select'
import TextInput from '#ui-ink/components/TextInput'
import {
  ScreenContainer,
  type ScreenContainerExitState,
} from '../ScreenContainer'

import type { ModelInfo } from '../types'

type Props = {
  theme: any
  exitState: ScreenContainerExitState
  terminalRows: number
  terminalColumns: number
  compactLayout: boolean
  tightLayout: boolean
  containerPaddingY: number
  containerGap: number
  selectedProvider: string
  availableModels: ModelInfo[]
  modelSearchQuery: string
  modelSearchCursorOffset: number
  handleModelSearchChange: (value: string) => void
  handleModelSearchCursorOffsetChange: (offset: number) => void
  modelOptions: Array<{ label: string; value: string }>
  handleModelSelection: (value: string) => void
  getProviderLabel: (provider: string, modelCount: number) => string
}

const VIEWPORT_SAFE_MARGIN_ROWS = 1

export function ModelSelectionScreen({
  theme,
  exitState,
  terminalRows,
  terminalColumns,
  compactLayout,
  tightLayout,
  containerPaddingY,
  containerGap,
  selectedProvider,
  availableModels,
  modelSearchQuery,
  modelSearchCursorOffset,
  handleModelSearchChange,
  handleModelSearchCursorOffsetChange,
  modelOptions,
  handleModelSelection,
  getProviderLabel,
}: Props) {
  const modelTypeText = 'this model profile'
  const descriptionWidth = Math.max(1, Math.min(70, terminalColumns - 10))
  const inputColumns = Math.max(1, Math.min(80, terminalColumns - 10))

  const reservedLines =
    (tightLayout ? 10 : compactLayout ? 12 : 14) +
    containerPaddingY * 2 +
    containerGap * 4
  const availableForList = Math.max(
    3,
    terminalRows - reservedLines - 1 - VIEWPORT_SAFE_MARGIN_ROWS,
  )
  const visibleOptionCount = Math.max(
    3,
    Math.min(12, modelOptions.length || 12, availableForList),
  )

  return (
    <ScreenContainer
      title="Model Selection"
      exitState={exitState}
      paddingY={containerPaddingY}
      gap={containerGap}
    >
      <Box flexDirection="column" gap={containerGap}>
        <Text bold>
          Select a model from{' '}
          {
            getProviderLabel(selectedProvider, availableModels.length).split(
              ' (',
            )[0]
          }{' '}
          for {modelTypeText}:
        </Text>
        {!tightLayout && (
          <Box flexDirection="column" width={descriptionWidth}>
            <Text color={theme.secondaryText}>
              {compactLayout
                ? 'Pick a model for this profile.'
                : 'This profile can be assigned to pointers (main, task, compact, quick) for different use cases.'}
            </Text>
          </Box>
        )}

        <Box marginTop={tightLayout ? 0 : 1}>
          {!tightLayout && <Text bold>Search models:</Text>}
          <TextInput
            placeholder="Type to filter models..."
            value={modelSearchQuery}
            onChange={handleModelSearchChange}
            columns={inputColumns}
            cursorOffset={modelSearchCursorOffset}
            onChangeCursorOffset={handleModelSearchCursorOffsetChange}
            showCursor={true}
            focus={true}
          />
        </Box>

        {modelOptions.length > 0 ? (
          <>
            <Select
              options={modelOptions}
              onChange={handleModelSelection}
              visibleOptionCount={visibleOptionCount}
            />
            {!tightLayout && (
              <Text dimColor>
                Showing {modelOptions.length} of {availableModels.length} models
              </Text>
            )}
          </>
        ) : (
          <Box>
            {availableModels.length > 0 ? (
              <Text color="yellow">
                No models match your search. Try a different query.
              </Text>
            ) : (
              <Text color="yellow">No models available for this provider.</Text>
            )}
          </Box>
        )}

        <Box marginTop={tightLayout ? 0 : 1}>
          <Text dimColor>
            Press <Text color={theme.suggestion}>Esc</Text> to go back to API
            key input
          </Text>
        </Box>
      </Box>
    </ScreenContainer>
  )
}
