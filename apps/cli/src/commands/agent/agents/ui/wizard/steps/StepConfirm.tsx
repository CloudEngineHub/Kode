import React, { useRef, useState } from 'react'
import { Box, Text } from 'ink'
import type { AgentConfig } from '#core/utils/agentLoader'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import type { Tool } from '../../../tooling'
import { validateAgentConfig, validateAgentType } from '../../../generation'
import { getPrimaryAgentFilePath } from '../../../storage'
import { themeColor } from '../../colors'
import { formatModelLong, titleForSource } from '../../utils'
import {
  getWizardStepSubtitle,
  WizardPanel,
  type WizardContextValue,
} from '../Wizard'
import type { WizardFinalAgent } from '../types'

function validateFinalAgent(args: {
  finalAgent: WizardFinalAgent
  tools: Tool[]
  existingAgents: AgentConfig[]
}): { errors: string[]; warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []

  const typeValidation = validateAgentType(args.finalAgent.agentType)
  errors.push(...typeValidation.errors)
  warnings.push(...typeValidation.warnings)

  const duplicate = args.existingAgents.find(
    agent =>
      agent.agentType === args.finalAgent.agentType &&
      agent.source !== 'built-in' &&
      agent.source !== args.finalAgent.source,
  )
  if (duplicate) {
    errors.push(
      `Agent type "${args.finalAgent.agentType}" already exists in ${titleForSource(duplicate.source as any)}`,
    )
  }

  const configValidation = validateAgentConfig({
    agentType: args.finalAgent.agentType,
    whenToUse: args.finalAgent.whenToUse,
    systemPrompt: args.finalAgent.systemPrompt,
    selectedTools: args.finalAgent.tools,
  })
  errors.push(...configValidation.errors)
  warnings.push(...configValidation.warnings)

  const availableToolNames = new Set(args.tools.map(t => t.name))
  const selectedTools = args.finalAgent.tools ?? undefined
  if (selectedTools && selectedTools.length > 0) {
    const unknown = selectedTools.filter(t => !availableToolNames.has(t))
    if (unknown.length > 0)
      warnings.push(`Unrecognized tools: ${unknown.join(', ')}`)
  }

  return { errors, warnings }
}

function getConfirmFooterText(isSaving: boolean): string {
  return isSaving
    ? 'Saving agent...'
    : 'Enter/s to save - e to save and edit - Esc to go back'
}

export const __getConfirmFooterTextForTests = getConfirmFooterText

function getToolSummary(tools: string[] | undefined): string {
  if (tools === undefined) return 'All tools (recommended default)'
  if (tools.length === 0) return 'No tools (strict and limited)'
  if (tools.length === 1) return tools[0] || 'No tools'
  if (tools.length === 2) return tools.join(' and ')
  return `${tools.slice(0, -1).join(', ')}, and ${tools[tools.length - 1]}`
}

export const __getToolSummaryForTests = getToolSummary

function getLocationSummary(source: WizardFinalAgent['source']): string {
  return source === 'projectSettings'
    ? 'Project agent (.kode/agents)'
    : 'Personal agent (~/.kode/agents)'
}

const TOOL_ACCESS_ADVISORY_NOTES: Record<string, string> = {
  'Agent has access to all tools':
    'All tools are enabled. Limit tools only for stricter specialists.',
  'No tools selected - agent will have very limited capabilities':
    'No tools are enabled. This is strict, but limits what the agent can do.',
}

function splitValidationWarnings(warnings: string[]): {
  notes: string[]
  warnings: string[]
} {
  const notes: string[] = []
  const actionableWarnings: string[] = []

  for (const warning of warnings) {
    const note = TOOL_ACCESS_ADVISORY_NOTES[warning]
    if (note) notes.push(note)
    else actionableWarnings.push(warning)
  }

  return { notes, warnings: actionableWarnings }
}

export const __splitValidationWarningsForTests = splitValidationWarnings

export function StepConfirm(props: {
  ctx: WizardContextValue
  tools: Tool[]
  existingAgents: AgentConfig[]
  onSave: (finalAgent: WizardFinalAgent, openEditor: boolean) => Promise<void>
}) {
  const { ctx } = props
  const finalAgent = ctx.wizardData.finalAgent
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const isSavingRef = useRef(false)

  useKeypress((input, key) => {
    if (isSavingRef.current) return true

    if (key.escape) {
      ctx.goBack()
      return true
    }
    if (input === 'e') {
      void doSave(true)
      return true
    }
    if (input === 's' || key.return) {
      void doSave(false)
      return true
    }
  })

  const doSave = async (openEditor: boolean) => {
    if (!finalAgent || isSavingRef.current) return

    const { errors } = validateFinalAgent({
      finalAgent,
      tools: props.tools,
      existingAgents: props.existingAgents,
    })
    if (errors.length > 0) {
      setError(errors[0] ?? 'Invalid agent configuration')
      return
    }

    setError(null)
    isSavingRef.current = true
    setIsSaving(true)
    try {
      await props.onSave(finalAgent, openEditor)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      isSavingRef.current = false
      setIsSaving(false)
    }
  }

  if (!finalAgent) return null

  const validation = validateFinalAgent({
    finalAgent,
    tools: props.tools,
    existingAgents: props.existingAgents,
  })

  const locationPath =
    finalAgent.source === 'projectSettings'
      ? getPrimaryAgentFilePath('project', finalAgent.agentType)
      : getPrimaryAgentFilePath('user', finalAgent.agentType)

  const truncate = (text: string) =>
    text.length > 240 ? `${text.slice(0, 240)}...` : text

  const footerText = getConfirmFooterText(isSaving)
  const validationMessages = splitValidationWarnings(validation.warnings)

  return (
    <WizardPanel
      subtitle={getWizardStepSubtitle(ctx, 'Review and save')}
      footerText={footerText}
    >
      <Box flexDirection="column" marginTop={1} gap={1}>
        {ctx.wizardData.method === 'quickGenerate' ? (
          <Text dimColor>
            Quick draft used recommended defaults. Save now, or press e to open
            advanced editing after save.
          </Text>
        ) : null}
        <Text>
          <Text bold>Name</Text>: {finalAgent.agentType}
        </Text>
        <Text>
          <Text bold>Location</Text>: {getLocationSummary(finalAgent.source)}
        </Text>
        <Text dimColor>File: {locationPath}</Text>
        <Text>
          <Text bold>Tools</Text>: {getToolSummary(finalAgent.tools)}
        </Text>
        <Text>
          <Text bold>Model</Text>: {formatModelLong(finalAgent.model)}
        </Text>

        <Box marginTop={1} flexDirection="column">
          <Text>
            <Text bold>Trigger</Text>:
          </Text>
          <Box marginLeft={2} marginTop={1}>
            <Text>{truncate(finalAgent.whenToUse)}</Text>
          </Box>
        </Box>

        <Box marginTop={1} flexDirection="column">
          <Text>
            <Text bold>System prompt</Text>:
          </Text>
          <Box marginLeft={2} marginTop={1}>
            <Text>{truncate(finalAgent.systemPrompt)}</Text>
          </Box>
        </Box>

        {validationMessages.notes.length > 0 ? (
          <Box marginTop={1} flexDirection="column">
            <Text dimColor>Notes:</Text>
            {validationMessages.notes.map((w, i) => (
              <React.Fragment key={i}>
                <Text dimColor> - {w}</Text>
              </React.Fragment>
            ))}
          </Box>
        ) : null}

        {validationMessages.warnings.length > 0 ? (
          <Box marginTop={1} flexDirection="column">
            <Text color={themeColor('warning')}>Warnings:</Text>
            {validationMessages.warnings.map((w, i) => (
              <React.Fragment key={i}>
                <Text dimColor> - {w}</Text>
              </React.Fragment>
            ))}
          </Box>
        ) : null}

        {validation.errors.length > 0 ? (
          <Box marginTop={1} flexDirection="column">
            <Text color={themeColor('error')}>Errors:</Text>
            {validation.errors.map((e, i) => (
              <React.Fragment key={i}>
                <Text color={themeColor('error')}> - {e}</Text>
              </React.Fragment>
            ))}
          </Box>
        ) : null}

        {isSaving ? (
          <Box marginTop={1}>
            <Text dimColor>Saving agent...</Text>
          </Box>
        ) : null}

        {error ? (
          <Box marginTop={1}>
            <Text color={themeColor('error')}>{error}</Text>
          </Box>
        ) : null}
      </Box>
    </WizardPanel>
  )
}
