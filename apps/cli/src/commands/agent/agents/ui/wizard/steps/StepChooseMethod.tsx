import React from 'react'
import { Box, Text } from 'ink'
import { Select } from '#ui-ink/components/CustomSelect/select'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import {
  getWizardStepSubtitle,
  WizardPanel,
  type WizardContextValue,
} from '../Wizard'
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
      subtitle={getWizardStepSubtitle(ctx, 'Choose setup path')}
      footerText="Press Up/Down to navigate - Enter to select - Esc to go back"
    >
      <Box flexDirection="column" marginTop={1} gap={1}>
        <Text dimColor>
          Quick draft asks one question and uses recommended defaults. Advanced
          paths keep every control available.
        </Text>
        <Select
          key="method-select"
          options={[
            {
              label: 'Quick draft (recommended) - describe, review, save',
              value: 'quickGenerate',
            },
            {
              label: 'Customize draft - AI writes it, you tune settings',
              value: 'customGenerate',
            },
            {
              label: 'Manual setup - write every field yourself',
              value: 'manual',
            },
          ]}
          onChange={value => {
            const method: WizardMethod = (() => {
              if (value === 'manual') return 'manual'
              if (value === 'customGenerate') return 'customGenerate'
              return 'quickGenerate'
            })()
            ctx.updateWizardData({
              method,
              wasGenerated: false,
              finalAgent: undefined,
            })
            if (method !== 'manual') ctx.goNext()
            else ctx.goToStep(3)
          }}
        />
      </Box>
    </WizardPanel>
  )
}
