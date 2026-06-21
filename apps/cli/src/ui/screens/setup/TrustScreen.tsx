import React from 'react'
import { Box, Text } from 'ink'
import { getTheme } from '#core/utils/theme'
import { Select } from '#ui-ink/components/CustomSelect/select'
import {
  saveCurrentProjectConfig,
  getCurrentProjectConfig,
} from '#core/utils/config'
import { PRODUCT_NAME } from '#core/constants/product'
import { useExitOnCtrlCD } from '#ui-ink/hooks/useExitOnCtrlCD'
import { homedir } from 'os'
import { getCwd } from '#core/utils/state'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { ScreenFrame } from '#ui-ink/primitives/layout/ScreenFrame'
import { useScreenLayout } from '#ui-ink/primitives/layout/useScreenLayout'

type Props = {
  onDone(): void
}

export function TrustScreen({ onDone }: Props): React.ReactNode {
  const theme = getTheme()
  const layout = useScreenLayout()
  React.useEffect(() => {}, [])

  function onChange(value: 'yes' | 'no') {
    const config = getCurrentProjectConfig()
    switch (value) {
      case 'yes': {
        const isHomeDir = homedir() === getCwd()

        if (!isHomeDir) {
          saveCurrentProjectConfig({
            ...config,
            hasTrustDialogAccepted: true,
          })
        }
        onDone()
        break
      }
      case 'no': {
        process.exit(1)
        break
      }
    }
  }

  const exitState = useExitOnCtrlCD(() => process.exit(0))

  useKeypress((_input, key) => {
    if (key.escape) {
      process.exit(0)
      return
    }
  })

  return (
    <ScreenFrame
      title="Trust This Folder?"
      exitState={exitState}
      paddingX={layout.paddingX}
      paddingY={layout.paddingY}
      gap={layout.gap}
    >
      <Box flexDirection="column" gap={layout.gap}>
        <Text bold color={theme.warning} wrap="truncate-end">
          Do you trust the files in this folder?
        </Text>
        <Text bold wrap="truncate-end">
          {process.cwd()}
        </Text>

        <Box flexDirection="column" gap={layout.gap}>
          <Text wrap="truncate-end">
            {PRODUCT_NAME} may read files in this folder. Reading untrusted
            files may lead to {PRODUCT_NAME} behaving unexpectedly.
          </Text>
          <Text wrap="truncate-end">
            With your permission, {PRODUCT_NAME} may execute files in this
            folder. Executing untrusted code is unsafe.
          </Text>
        </Box>

        <Select
          options={[
            { label: 'Yes, proceed', value: 'yes' },
            { label: 'No, exit', value: 'no' },
          ]}
          onChange={value => onChange(value as 'yes' | 'no')}
        />

        <Box marginTop={layout.tightLayout ? 0 : 1}>
          <Text dimColor wrap="truncate-end">
            {exitState.pending
              ? `Press ${exitState.keyName} again to exit`
              : 'Enter confirm · Esc exit'}
          </Text>
        </Box>
      </Box>
    </ScreenFrame>
  )
}
