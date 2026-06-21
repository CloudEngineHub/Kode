import React from 'react'
import { Box, Text } from 'ink'
import type { Tool } from '../../../tooling'
import { Instructions, Panel } from '../../components'
import { ToolPicker } from '../ToolPicker'
import { getWizardStepSubtitle, type WizardContextValue } from '../Wizard'

export function StepSelectTools(props: {
  ctx: WizardContextValue
  tools: Tool[]
}) {
  const { ctx } = props
  const initialTools = ctx.wizardData.selectedTools
  return (
    <>
      <Panel
        title="Create new agent"
        subtitle={getWizardStepSubtitle(ctx, 'Select tools')}
      >
        <Box flexDirection="column" gap={1}>
          <Text dimColor>
            Keep All tools for general agents. Limit tools only for stricter or
            safer specialists.
          </Text>
          <ToolPicker
            tools={props.tools}
            initialTools={initialTools}
            onComplete={selected => {
              ctx.updateWizardData({ selectedTools: selected })
              ctx.goNext()
            }}
            onCancel={ctx.goBack}
          />
        </Box>
      </Panel>
      <Instructions instructions="Press Enter to activate - Up/Down to navigate - Esc to go back" />
    </>
  )
}
