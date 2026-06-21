import React from 'react'
import { Box, Text } from 'ink'
import { Select } from '#ui-ink/components/CustomSelect/select'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import {
  getWizardStepSubtitle,
  WizardPanel,
  type WizardContextValue,
} from '../Wizard'

export function StepChooseLocation({ ctx }: { ctx: WizardContextValue }) {
  useKeypress((_input, key) => {
    if (key.escape) {
      ctx.cancel()
      return true
    }
  })

  return (
    <WizardPanel
      subtitle={getWizardStepSubtitle(ctx, 'Choose location')}
      footerText="Press Up/Down to navigate - Enter to select - Esc to cancel"
    >
      <Box flexDirection="column" marginTop={1} gap={1}>
        <Text dimColor>
          Project is best for this repo. Personal is best for reusable agents.
        </Text>
        <Select
          key="location-select"
          options={[
            {
              label: 'Project (recommended) - saved in .kode/agents/',
              value: 'projectSettings',
            },
            {
              label: 'Personal - saved in ~/.kode/agents/',
              value: 'userSettings',
            },
          ]}
          onChange={value => {
            const location =
              value === 'projectSettings' ? 'projectSettings' : 'userSettings'
            ctx.updateWizardData({ location })
            ctx.goNext()
          }}
        />
      </Box>
    </WizardPanel>
  )
}
