import React from 'react'
import { Box } from 'ink'
import { ColorPicker } from '../../ColorPicker'
import type { AgentColor } from '../../types'
import { DEFAULT_AGENT_MODEL } from '../../types'
import type { WizardFinalAgent } from '../types'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { WizardPanel, type WizardContextValue } from '../Wizard'

export function StepChooseColor({ ctx }: { ctx: WizardContextValue }) {
  useKeypress((_input, key) => {
    if (key.escape) {
      ctx.goBack()
      return true
    }
  })

  const agentType = ctx.wizardData.agentType ?? 'agent'
  const onConfirm = (color: AgentColor) => {
    const selectedColor = color === 'automatic' ? undefined : color
    const finalAgent: WizardFinalAgent = {
      agentType: ctx.wizardData.agentType ?? agentType,
      whenToUse: ctx.wizardData.whenToUse ?? '',
      systemPrompt: ctx.wizardData.systemPrompt ?? '',
      tools: ctx.wizardData.selectedTools,
      model: ctx.wizardData.selectedModel ?? DEFAULT_AGENT_MODEL,
      ...(selectedColor ? { color: selectedColor } : {}),
      source: ctx.wizardData.location ?? 'projectSettings',
    }

    ctx.updateWizardData({
      selectedColor: selectedColor,
      finalAgent,
    })
    ctx.goNext()
  }

  return (
    <WizardPanel
      subtitle="Choose background color"
      footerText="Press Up/Down to navigate - Enter to select - Esc to go back"
    >
      <Box marginTop={1}>
        <ColorPicker
          agentName={agentType}
          currentColor="automatic"
          onConfirm={onConfirm}
        />
      </Box>
    </WizardPanel>
  )
}
