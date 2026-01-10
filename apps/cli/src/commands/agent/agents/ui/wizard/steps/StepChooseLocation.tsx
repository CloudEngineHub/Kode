import React from 'react'
import { Box } from 'ink'
import { Select } from '#ui-ink/components/CustomSelect/select'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { WizardPanel, type WizardContextValue } from '../Wizard'

export function StepChooseLocation({ ctx }: { ctx: WizardContextValue }) {
  useKeypress((_input, key) => {
    if (key.escape) ctx.cancel()
  })

  return (
    <WizardPanel
      subtitle="Choose location"
      footerText="Press ↑↓ to navigate · Enter to select · Esc to cancel"
    >
      <Box marginTop={1}>
        <Select
          options={[
            { label: 'Project (.claude/agents/)', value: 'projectSettings' },
            { label: 'Personal (~/.claude/agents/)', value: 'userSettings' },
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
