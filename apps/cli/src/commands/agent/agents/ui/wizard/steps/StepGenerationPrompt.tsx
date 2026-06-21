import React, { useRef, useState } from 'react'
import { Box, Text } from 'ink'
import TextInput from '#ui-ink/components/TextInput'
import type { AgentConfig } from '#core/utils/agentLoader'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { generateAgentDraft } from '../../../generation'
import { themeColor } from '../../colors'
import { WizardPanel, type WizardContextValue } from '../Wizard'

function getGenerationPromptFooterText(isGenerating: boolean): string {
  return isGenerating
    ? 'Esc to cancel generation'
    : 'Enter to generate - Esc to go back'
}

export const __getGenerationPromptFooterTextForTests =
  getGenerationPromptFooterText

export function StepGenerationPrompt(props: {
  ctx: WizardContextValue
  existingAgents: AgentConfig[]
}) {
  const { ctx } = props
  const [value, setValue] = useState(ctx.wizardData.generationPrompt ?? '')
  const [cursorOffset, setCursorOffset] = useState(value.length)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const isGeneratingRef = useRef(false)
  const columns = Math.min(80, process.stdout.columns ?? 80)
  const footerText = getGenerationPromptFooterText(isGenerating)

  useKeypress((_input, key) => {
    if (!key.escape) return
    if (isGeneratingRef.current && abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
      isGeneratingRef.current = false
      setIsGenerating(false)
      ctx.updateWizardData({ isGenerating: false })
      setError('Generation cancelled')
      return true
    }
    if (!isGeneratingRef.current) {
      ctx.updateWizardData({
        generationPrompt: '',
        agentType: '',
        systemPrompt: '',
        whenToUse: '',
        wasGenerated: false,
        isGenerating: false,
      })
      setValue('')
      setCursorOffset(0)
      setError(null)
      ctx.goBack()
      return true
    }
  })

  const onSubmit = async () => {
    if (isGeneratingRef.current) return

    const trimmed = value.trim()
    if (!trimmed) {
      setError('Please describe what the agent should do')
      return
    }

    setError(null)
    isGeneratingRef.current = true
    setIsGenerating(true)
    ctx.updateWizardData({ generationPrompt: trimmed, isGenerating: true })

    const abort = new AbortController()
    abortRef.current = abort

    try {
      const existing = props.existingAgents
        .filter(a => a.source !== 'built-in')
        .map(a => a.agentType)

      const generated = await generateAgentDraft(trimmed, {
        existingIdentifiers: existing,
        signal: abort.signal,
      })
      if (abort.signal.aborted || abortRef.current !== abort) return

      if (existing.includes(generated.identifier)) {
        throw new Error(
          `Agent identifier already exists: ${generated.identifier}. Please try again.`,
        )
      }

      ctx.updateWizardData({
        agentType: generated.identifier,
        whenToUse: generated.whenToUse,
        systemPrompt: generated.systemPrompt,
        wasGenerated: true,
        isGenerating: false,
      })
      isGeneratingRef.current = false
      setIsGenerating(false)
      abortRef.current = null
      ctx.goToStep(6)
    } catch (err) {
      if (abortRef.current !== abort) return

      if (abort.signal.aborted) {
        isGeneratingRef.current = false
        setIsGenerating(false)
        ctx.updateWizardData({ isGenerating: false })
        abortRef.current = null
        return
      }
      const message = err instanceof Error ? err.message : String(err)
      setError(message || 'Failed to generate agent')
      isGeneratingRef.current = false
      setIsGenerating(false)
      ctx.updateWizardData({ isGenerating: false })
      abortRef.current = null
    }
  }

  return (
    <WizardPanel subtitle="Describe the agent you want" footerText={footerText}>
      <Box flexDirection="column" marginTop={1} gap={1}>
        <Text>What should this agent do?</Text>
        <Text dimColor>
          Describe a role like "code reviewer", "security auditor", or "tech
          lead".
        </Text>
        <TextInput
          value={value}
          onChange={setValue}
          columns={columns}
          multiline
          focus={!isGenerating}
          onSubmit={onSubmit}
          cursorOffset={cursorOffset}
          onChangeCursorOffset={setCursorOffset}
        />
        {error ? <Text color={themeColor('error')}>{error}</Text> : null}
        {isGenerating ? <Text dimColor>Generating...</Text> : null}
      </Box>
    </WizardPanel>
  )
}
