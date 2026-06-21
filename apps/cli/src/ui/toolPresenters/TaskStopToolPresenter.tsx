import { Box, Text } from 'ink'
import React from 'react'

import { FallbackToolUseRejectedMessage } from '#ui-ink/components/FallbackToolUseRejectedMessage'

type Input = { task_id?: string; shell_id?: string }
type Output = { message: string; task_id: string; task_type: string }

function resolveTaskId(input: Input): string | null {
  return input.task_id ?? input.shell_id ?? null
}

export function renderTaskStopToolUseMessage(input: Input): string {
  return resolveTaskId(input) ?? ''
}

export function renderTaskStopToolUseRejectedMessage(): React.ReactElement {
  return <FallbackToolUseRejectedMessage />
}

export function renderTaskStopToolResultMessage(_output: Output) {
  return (
    <Box flexDirection="row">
      <Text>&nbsp;&nbsp;⎿ &nbsp;</Text>
      <Text>Task stopped</Text>
    </Box>
  )
}
