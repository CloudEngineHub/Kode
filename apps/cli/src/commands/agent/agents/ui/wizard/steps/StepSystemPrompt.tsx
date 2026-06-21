import React, { useState } from 'react'
import { Box, Text } from 'ink'
import TextInput from '#ui-ink/components/TextInput'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { themeColor } from '../../colors'
import {
  getWizardStepSubtitle,
  WizardPanel,
  type WizardContextValue,
} from '../Wizard'

export function StepSystemPrompt({ ctx }: { ctx: WizardContextValue }) {
  const [value, setValue] = useState(ctx.wizardData.systemPrompt ?? '')
  const [cursorOffset, setCursorOffset] = useState(value.length)
  const [error, setError] = useState<string | null>(null)
  const columns = Math.min(80, process.stdout.columns ?? 80)

  useKeypress((_input, key) => {
    if (key.escape) {
      ctx.goBack()
      return true
    }
  })

  const onSubmit = (next: string) => {
    const trimmed = next.trim()
    if (!trimmed) {
      setError('System prompt is required')
      return
    }
    setError(null)
    ctx.updateWizardData({ systemPrompt: trimmed })
    ctx.goNext()
  }

  return (
    <WizardPanel
      subtitle={getWizardStepSubtitle(ctx, 'Write instructions')}
      footerText="Press Enter to continue - Esc to go back"
    >
      <Box flexDirection="column" marginTop={1} gap={1}>
        <Text>Enter the system prompt for your agent:</Text>
        <Text dimColor>
          Define role, rules, done criteria, and what to do when information is
          missing.
        </Text>
        <TextInput
          value={value}
          onChange={setValue}
          columns={columns}
          multiline
          onSubmit={onSubmit}
          cursorOffset={cursorOffset}
          onChangeCursorOffset={setCursorOffset}
        />
        {error ? <Text color={themeColor('error')}>{error}</Text> : null}
      </Box>
    </WizardPanel>
  )
}
