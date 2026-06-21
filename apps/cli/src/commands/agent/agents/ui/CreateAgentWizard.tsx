import React, { useMemo } from 'react'
import chalk from 'chalk'
import type { AgentConfig } from '#core/utils/agentLoader'
import type { Tool } from '../tooling'
import { getPrimaryAgentFilePath, saveAgent } from '../storage'
import { openInEditor } from './utils'
import { Wizard, type WizardContextValue } from './wizard/Wizard'
import { wizardLocationToStorageLocation } from './wizard/types'
import { StepAgentType } from './wizard/steps/StepAgentType'
import { StepChooseColor } from './wizard/steps/StepChooseColor'
import { StepChooseLocation } from './wizard/steps/StepChooseLocation'
import { StepChooseMethod } from './wizard/steps/StepChooseMethod'
import { StepConfirm } from './wizard/steps/StepConfirm'
import { StepDescription } from './wizard/steps/StepDescription'
import { StepGenerationPrompt } from './wizard/steps/StepGenerationPrompt'
import { StepSelectModel } from './wizard/steps/StepSelectModel'
import { StepSelectTools } from './wizard/steps/StepSelectTools'
import { StepSystemPrompt } from './wizard/steps/StepSystemPrompt'

export function CreateAgentWizard(props: {
  tools: Tool[]
  existingAgents: AgentConfig[]
  onComplete: (message: string) => void | Promise<void>
  onCancel: () => void
}) {
  const steps = useMemo(() => {
    return [
      (ctx: WizardContextValue) => <StepChooseLocation ctx={ctx} />,
      (ctx: WizardContextValue) => <StepChooseMethod ctx={ctx} />,
      (ctx: WizardContextValue) => (
        <StepGenerationPrompt ctx={ctx} existingAgents={props.existingAgents} />
      ),
      (ctx: WizardContextValue) => <StepAgentType ctx={ctx} />,
      (ctx: WizardContextValue) => <StepSystemPrompt ctx={ctx} />,
      (ctx: WizardContextValue) => <StepDescription ctx={ctx} />,
      (ctx: WizardContextValue) => (
        <StepSelectTools ctx={ctx} tools={props.tools} />
      ),
      (ctx: WizardContextValue) => <StepSelectModel ctx={ctx} />,
      (ctx: WizardContextValue) => <StepChooseColor ctx={ctx} />,
      (ctx: WizardContextValue) => (
        <StepConfirm
          ctx={ctx}
          tools={props.tools}
          existingAgents={props.existingAgents}
          onSave={async (finalAgent, openEditor) => {
            const location = wizardLocationToStorageLocation(finalAgent.source)
            const tools = finalAgent.tools ?? ['*']
            await saveAgent(
              location,
              finalAgent.agentType,
              finalAgent.whenToUse,
              tools,
              finalAgent.systemPrompt,
              finalAgent.model,
              finalAgent.color,
              true,
            )

            if (openEditor) {
              const path = getPrimaryAgentFilePath(
                location,
                finalAgent.agentType,
              )
              await openInEditor(path)
              await props.onComplete(
                `Created agent: ${chalk.bold(finalAgent.agentType)} and opened in editor. If you made edits, restart to load the latest version.`,
              )
              return
            }

            await props.onComplete(
              `Created agent: ${chalk.bold(finalAgent.agentType)}`,
            )
          }}
        />
      ),
    ]
  }, [props])

  return <Wizard steps={steps} onCancel={props.onCancel} onDone={() => {}} />
}
