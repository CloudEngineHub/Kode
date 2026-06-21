import React from 'react'
import { Box, Text } from 'ink'
import { Select } from '#ui-ink/components/CustomSelect/select'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { modelOptions } from '../../utils'
import { DEFAULT_AGENT_MODEL } from '../../types'
import { WizardPanel, type WizardContextValue } from '../Wizard'

export function StepSelectModel({ ctx }: { ctx: WizardContextValue }) {
  useKeypress((_input, key) => {
    if (key.escape) {
      ctx.goBack()
      return true
    }
  })

  const options = modelOptions()
  const defaultValue = ctx.wizardData.selectedModel ?? DEFAULT_AGENT_MODEL

  return (
    <WizardPanel
      subtitle="Select model"
      footerText="Press Up/Down to navigate - Enter to select - Esc to go back"
    >
      <Box flexDirection="column" marginTop={1} gap={1}>
        <Text dimColor>
          Model determines the agent&apos;s reasoning capabilities and speed.
        </Text>
        <Select
          options={options}
          defaultValue={defaultValue}
          onChange={value => {
            ctx.updateWizardData({ selectedModel: value })
            ctx.goNext()
          }}
        />
      </Box>
    </WizardPanel>
  )
}
