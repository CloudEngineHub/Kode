import { Box, Text } from 'ink'
import React from 'react'

import { FallbackToolUseRejectedMessage } from '#ui-ink/components/FallbackToolUseRejectedMessage'

type Input = { shell_id: string }
type Output = { message: string; shell_id: string }

export function renderKillShellToolUseMessage({ shell_id }: Input): string {
  return `Kill shell: ${shell_id}`
}

export function renderKillShellToolUseRejectedMessage(): React.ReactElement {
  return <FallbackToolUseRejectedMessage />
}

export function renderKillShellToolResultMessage(output: Output) {
  return (
    <Box flexDirection="row">
      <Text>&nbsp;&nbsp;⎿ &nbsp;</Text>
      <Text>Shell {output.shell_id} killed</Text>
    </Box>
  )
}
