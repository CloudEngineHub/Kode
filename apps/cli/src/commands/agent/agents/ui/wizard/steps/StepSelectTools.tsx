import React from 'react'
import type { Tool } from '../../../tooling'
import { Instructions, Panel } from '../../components'
import { ToolPicker } from '../ToolPicker'
import type { WizardContextValue } from '../Wizard'

export function StepSelectTools(props: {
  ctx: WizardContextValue
  tools: Tool[]
}) {
  const { ctx } = props
  const initialTools = ctx.wizardData.selectedTools
  return (
    <>
      <Panel title="Create new agent" subtitle="Select tools">
        <ToolPicker
          tools={props.tools}
          initialTools={initialTools}
          onComplete={selected => {
            ctx.updateWizardData({ selectedTools: selected })
            ctx.goNext()
          }}
          onCancel={ctx.goBack}
        />
      </Panel>
      <Instructions instructions="Press Enter to toggle selection - Up/Down Navigate - Esc to go back" />
    </>
  )
}
