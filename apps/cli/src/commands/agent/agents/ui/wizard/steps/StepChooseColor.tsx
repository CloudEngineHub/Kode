import React from 'react'
import { Box, Text } from 'ink'
import { ColorPicker } from '../../ColorPicker'
import {
  COLOR_OPTIONS,
  DEFAULT_AGENT_MODEL,
  type AgentColor,
} from '../../types'
import type { WizardFinalAgent } from '../types'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import {
  getWizardStepSubtitle,
  WizardPanel,
  type WizardContextValue,
} from '../Wizard'

export function StepChooseColor({ ctx }: { ctx: WizardContextValue }) {
  useKeypress((_input, key) => {
    if (key.escape) {
      ctx.goBack()
      return true
    }
  })

  const agentType = ctx.wizardData.agentType ?? 'agent'
  const currentColor = COLOR_OPTIONS.includes(
    ctx.wizardData.selectedColor as AgentColor,
  )
    ? (ctx.wizardData.selectedColor as AgentColor)
    : 'automatic'

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
      subtitle={getWizardStepSubtitle(ctx, 'Choose color')}
      footerText="Press Up/Down to navigate - Enter to select - Esc to go back"
    >
      <Box flexDirection="column" marginTop={1} gap={1}>
        <Text dimColor>
          Automatic is fine. Pick a color only to make busy agent lists easier
          to scan.
        </Text>
        <ColorPicker
          agentName={agentType}
          currentColor={currentColor}
          onConfirm={onConfirm}
        />
      </Box>
    </WizardPanel>
  )
}
