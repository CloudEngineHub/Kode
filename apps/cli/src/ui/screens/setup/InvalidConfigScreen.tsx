import React from 'react'
import { Box, Newline, Text } from 'ink'
import { getTheme } from '#core/utils/theme'
import { Select } from '#ui-ink/components/CustomSelect/select'
import { render } from 'ink'
import { renderWithTuiStdio } from '#ui-ink/utils/inkRender'
import { writeFileSync } from 'fs'
import { ConfigParseError } from '#core/utils/errors'
import { useExitOnCtrlCD } from '#ui-ink/hooks/useExitOnCtrlCD'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { ScreenFrame } from '#ui-ink/primitives/layout/ScreenFrame'
import { useScreenLayout } from '#ui-ink/primitives/layout/useScreenLayout'
interface InvalidConfigHandlerProps {
  error: ConfigParseError
}

interface InvalidConfigDialogProps {
  filePath: string
  errorDescription: string
  onExit: () => void
  onReset: () => void
}

/**
 * Dialog shown when the Kode config file contains invalid JSON
 */
function InvalidConfigScreen({
  filePath,
  errorDescription,
  onExit,
  onReset,
}: InvalidConfigDialogProps): React.ReactNode {
  const theme = getTheme()
  const layout = useScreenLayout()

  // Handle escape key
  useKeypress((_, key) => {
    if (key.escape) {
      onExit()
    }
  })

  const exitState = useExitOnCtrlCD(() => process.exit(0))

  // Handler for Select onChange
  const handleSelect = (value: string) => {
    if (value === 'exit') {
      onExit()
    } else {
      onReset()
    }
  }

  return (
    <ScreenFrame
      title="Configuration Error"
      exitState={exitState}
      paddingX={layout.paddingX}
      paddingY={layout.paddingY}
      gap={layout.gap}
    >
      <Box flexDirection="column" gap={layout.gap}>
        <Box flexDirection="column" gap={layout.gap}>
          <Text wrap="truncate-end">
            The configuration file at <Text bold>{filePath}</Text> contains
            invalid JSON.
          </Text>
          <Text color={theme.error} wrap="truncate-end">
            {errorDescription}
          </Text>
        </Box>

        <Box flexDirection="column" gap={layout.gap}>
          <Text bold>Choose an option:</Text>
          <Select
            options={[
              { label: 'Exit and fix manually', value: 'exit' },
              { label: 'Reset with default configuration', value: 'reset' },
            ]}
            onChange={handleSelect}
          />
        </Box>

        <Box marginTop={layout.tightLayout ? 0 : 1}>
          <Text dimColor wrap="truncate-end">
            Enter select · Esc exit
          </Text>
        </Box>

        {exitState.pending ? (
          <Text dimColor wrap="truncate-end">
            Press {exitState.keyName} again to exit
          </Text>
        ) : (
          <Newline />
        )}
      </Box>
    </ScreenFrame>
  )
}

export function showInvalidConfigDialog({
  error,
}: InvalidConfigHandlerProps): Promise<void> {
  return new Promise(resolve => {
    renderWithTuiStdio(
      render,
      <InvalidConfigScreen
        filePath={error.filePath}
        errorDescription={error.message}
        onExit={() => {
          resolve()
          process.exit(1)
        }}
        onReset={() => {
          writeFileSync(
            error.filePath,
            JSON.stringify(error.defaultConfig, null, 2),
          )
          resolve()
          process.exit(0)
        }}
      />,
      { exitOnCtrlC: false },
    )
  })
}
