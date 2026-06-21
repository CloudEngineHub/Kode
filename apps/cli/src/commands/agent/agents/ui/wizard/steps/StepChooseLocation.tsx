import React from 'react'
import { Box } from 'ink'
import { Select } from '#ui-ink/components/CustomSelect/select'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { WizardPanel, type WizardContextValue } from '../Wizard'

export function StepChooseLocation({ ctx }: { ctx: WizardContextValue }) {
  useKeypress((_input, key) => {
    if (key.escape) {
      ctx.cancel()
      return true
    }
  })

  return (
    <WizardPanel
      subtitle="Choose location"
      footerText="Press Up/Down to navigate - Enter to select - Esc to cancel"
    >
      <Box marginTop={1}>
        <Select
          key="location-select"
          options={[
            { label: 'Project (.kode/agents/)', value: 'projectSettings' },
            { label: 'Personal (~/.kode/agents/)', value: 'userSettings' },
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
