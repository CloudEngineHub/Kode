import React, { useState } from 'react'
import { Box, Text } from 'ink'
import TextInput from '#ui-ink/components/TextInput'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { validateAgentType } from '../../../generation'
import { themeColor } from '../../colors'
import { WizardPanel, type WizardContextValue } from '../Wizard'

export function StepAgentType({ ctx }: { ctx: WizardContextValue }) {
  const [value, setValue] = useState(ctx.wizardData.agentType ?? '')
  const [cursorOffset, setCursorOffset] = useState(value.length)
  const [error, setError] = useState<string | null>(null)
  const columns = 60

  useKeypress((_input, key) => {
    if (key.escape) {
      ctx.goBack()
      return true
    }
  })

  const onSubmit = (next: string) => {
    const trimmed = next.trim()
    const validation = validateAgentType(trimmed)
    if (!validation.isValid) {
      setError(validation.errors[0] ?? 'Invalid agent type')
      return
    }
    setError(null)
    ctx.updateWizardData({ agentType: trimmed })
    ctx.goNext()
  }

  return (
    <WizardPanel
      subtitle="Agent type (identifier)"
      footerText="Press Enter to continue · Esc to go back"
    >
      <Box flexDirection="column" marginTop={1} gap={1}>
        <Text>Enter a unique identifier for your agent:</Text>
        <TextInput
          value={value}
          onChange={setValue}
          columns={columns}
          onSubmit={onSubmit}
          cursorOffset={cursorOffset}
          onChangeCursorOffset={setCursorOffset}
        />
        <Text dimColor>e.g., code-reviewer, tech-lead, etc</Text>
        {error ? <Text color={themeColor('error')}>{error}</Text> : null}
      </Box>
    </WizardPanel>
  )
}
