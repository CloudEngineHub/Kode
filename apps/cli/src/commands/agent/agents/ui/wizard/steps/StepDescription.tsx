import React, { useState } from 'react'
import { Box, Text } from 'ink'
import TextInput from '#ui-ink/components/TextInput'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { themeColor } from '../../colors'
import { WizardPanel, type WizardContextValue } from '../Wizard'

export function StepDescription({ ctx }: { ctx: WizardContextValue }) {
  const [value, setValue] = useState(ctx.wizardData.whenToUse ?? '')
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
      setError('Description is required')
      return
    }
    setError(null)
    ctx.updateWizardData({ whenToUse: trimmed })
    ctx.goNext()
  }

  return (
    <WizardPanel
      subtitle="Description (tell the agent when to use this agent)"
      footerText="Press Enter to continue - Esc to go back"
    >
      <Box flexDirection="column" marginTop={1} gap={1}>
        <Text>When should this agent be used?</Text>
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
