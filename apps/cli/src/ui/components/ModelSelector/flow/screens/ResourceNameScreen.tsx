import React from 'react'
import { Box, Newline, Text } from 'ink'

import TextInput from '#ui-ink/components/TextInput'
import {
  ScreenFrame,
  type ScreenExitState,
} from '#ui-ink/primitives/layout/ScreenFrame'

type Props = {
  theme: any
  exitState: ScreenExitState
  terminalColumns: number
  tightLayout: boolean
  containerPaddingY: number
  containerGap: number
  resourceName: string
  setResourceName: (value: string) => void
  handleResourceNameSubmit: (value: string) => void
  resourceNameCursorOffset: number
  setResourceNameCursorOffset: (value: number) => void
}

export function ResourceNameScreen({
  theme,
  exitState,
  terminalColumns,
  tightLayout,
  containerPaddingY,
  containerGap,
  resourceName,
  setResourceName,
  handleResourceNameSubmit,
  resourceNameCursorOffset,
  setResourceNameCursorOffset,
}: Props) {
  const inputColumns = Math.max(1, Math.min(80, terminalColumns - 10))
  const descriptionWidth = Math.max(1, Math.min(70, terminalColumns - 10))

  return (
    <ScreenFrame
      title="Azure Resource Setup"
      exitState={exitState}
      paddingX={tightLayout ? 1 : 2}
      paddingY={containerPaddingY}
      gap={containerGap}
    >
      <Box flexDirection="column" gap={containerGap}>
        <Text bold>Enter your Azure OpenAI resource name:</Text>
        {!tightLayout && (
          <Box flexDirection="column" width={descriptionWidth}>
            <Text color={theme.secondaryText}>
              This is the name of your Azure OpenAI resource (without the full
              domain).
              <Newline />
              For example, if your endpoint is
              "https://myresource.openai.azure.com", enter "myresource".
            </Text>
          </Box>
        )}

        <TextInput
          placeholder="myazureresource"
          value={resourceName}
          onChange={setResourceName}
          onSubmit={handleResourceNameSubmit}
          columns={inputColumns}
          cursorOffset={resourceNameCursorOffset}
          onChangeCursorOffset={setResourceNameCursorOffset}
          showCursor={true}
        />

        {!tightLayout && (
          <Box marginTop={1}>
            <Text>
              <Text color={theme.suggestion} dimColor={!resourceName}>
                [Submit Resource Name]
              </Text>
              <Text> - Press Enter to continue</Text>
            </Text>
          </Box>
        )}

        <Box marginTop={tightLayout ? 0 : 1}>
          <Text dimColor>
            Press <Text color={theme.suggestion}>Enter</Text> to continue or{' '}
            <Text color={theme.suggestion}>Esc</Text> to go back
          </Text>
        </Box>
      </Box>
    </ScreenFrame>
  )
}
