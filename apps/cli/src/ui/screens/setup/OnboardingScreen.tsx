import React, { useState } from 'react'
import { PRODUCT_NAME } from '#core/constants/product'
import { Box, Text } from 'ink'
import {
  DEFAULT_GLOBAL_CONFIG,
  getGlobalConfig,
  saveGlobalConfig,
} from '#core/utils/config'
import { useExitOnCtrlCD } from '#ui-ink/hooks/useExitOnCtrlCD'
import { Select } from '#ui-ink/components/CustomSelect/select'
import { StructuredDiff } from '#ui-ink/components/StructuredDiff'
import type { ThemeNames } from '#core/utils/theme'
import { ModelSelector } from '#ui-ink/components/ModelSelector'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { ScreenFrame } from '#ui-ink/primitives/layout/ScreenFrame'
import { useScreenLayout } from '#ui-ink/primitives/layout/useScreenLayout'

type Props = {
  onDone(result?: { skipped: boolean }): void
}

export function OnboardingScreen({ onDone }: Props): React.ReactNode {
  const layout = useScreenLayout()
  const [showModelSelector, setShowModelSelector] = useState(false)
  const config = getGlobalConfig()

  const [selectedTheme, setSelectedTheme] = useState(
    DEFAULT_GLOBAL_CONFIG.theme,
  )

  function handleThemeSelection(newTheme: string) {
    saveGlobalConfig({
      ...config,
      theme: newTheme as ThemeNames,
    })
    setShowModelSelector(true)
  }

  function handleThemePreview(newTheme: string) {
    setSelectedTheme(newTheme as ThemeNames)
  }

  const exitState = useExitOnCtrlCD(() => process.exit(0))

  const bodyWidth = Math.max(
    1,
    Math.min(70, layout.columns - layout.paddingX * 2),
  )
  const diffWidth = Math.max(24, Math.min(60, bodyWidth))

  useKeypress(
    (_input, key) => {
      if (key.escape) {
        onDone({ skipped: true })
        return true
      }
    },
    { isActive: !showModelSelector },
  )

  // Define all onboarding steps
  const themeStep = (
    <Box flexDirection="column" gap={layout.gap}>
      <Text>Let&apos;s get started.</Text>
      <Box flexDirection="column">
        <Text bold>Choose the option that looks best when you select it:</Text>
        <Text dimColor>To change this later, run /config</Text>
      </Box>
      <Select
        options={[
          { label: 'Light text', value: 'dark' },
          { label: 'Dark text', value: 'light' },
          {
            label: 'Light text (colorblind-friendly)',
            value: 'dark-daltonized',
          },
          {
            label: 'Dark text (colorblind-friendly)',
            value: 'light-daltonized',
          },
        ]}
        onFocus={handleThemePreview}
        onChange={handleThemeSelection}
      />
      <Box flexDirection="column">
        <Box paddingLeft={0} marginRight={0} flexDirection="column">
          <StructuredDiff
            patch={{
              oldStart: 1,
              newStart: 1,
              oldLines: 3,
              newLines: 3,
              lines: [
                'function greet() {',
                '-  console.log("Hello, World!");',
                '+  console.log("Hello, anon!");',
                '}',
              ],
            }}
            dim={false}
            width={diffWidth}
            overrideTheme={selectedTheme}
          />
        </Box>
      </Box>
    </Box>
  )

  // If we're showing the model selector screen, render it directly
  if (showModelSelector) {
    return (
      <ModelSelector
        onDone={() => onDone({ skipped: false })}
        skipModelType={true}
        isOnboarding={true}
      />
    )
  }

  return (
    <ScreenFrame
      title={PRODUCT_NAME}
      exitState={exitState}
      paddingX={layout.paddingX}
      paddingY={layout.paddingY}
      gap={layout.gap}
    >
      {themeStep}
      <Box marginTop={layout.gap} flexDirection="column">
        <Text dimColor wrap="truncate-end">
          Enter select · Esc skip
        </Text>
        <Text dimColor wrap="truncate-end">
          Tip: you can change this later with /config and /model.
        </Text>
      </Box>
    </ScreenFrame>
  )
}
