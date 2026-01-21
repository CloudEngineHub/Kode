import React from 'react'
import { Box } from 'ink'
import { Select } from '#ui-ink/components/CustomSelect/select'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { WizardPanel, type WizardContextValue } from '../Wizard'
import type { WizardMethod } from '../types'

export function StepChooseMethod({ ctx }: { ctx: WizardContextValue }) {
  useKeypress((_input, key) => {
    if (key.escape) {
      ctx.goBack()
      return true
    }
  })

  return (
    <WizardPanel
      subtitle="Creation method"
      footerText="Press ↑↓ to navigate · Enter to select · Esc to go back"
    >
      <Box marginTop={1}>
        <Select
          key="method-select"
          options={[
            {
              label: 'Generate with the current model (recommended)',
              value: 'generate',
            },
            { label: 'Manual configuration', value: 'manual' },
          ]}
          onChange={value => {
            const method: WizardMethod =
              value === 'manual' ? 'manual' : 'generate'
            ctx.updateWizardData({
              method,
              wasGenerated: method === 'generate',
            })
            if (method === 'generate') ctx.goNext()
            else ctx.goToStep(3)
          }}
        />
      </Box>
    </WizardPanel>
  )
}
