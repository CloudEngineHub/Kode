import { Box, Text } from 'ink'
import React from 'react'
import { z } from 'zod'
import { Cost } from '@components/Cost'
import { FallbackToolUseRejectedMessage } from '@components/FallbackToolUseRejectedMessage'
import { Tool } from '@tool'
import { BunShell } from '@utils/BunShell'
import { DESCRIPTION, TOOL_NAME_FOR_PROMPT } from './prompt'

const inputSchema = z.strictObject({
  shell_id: z.string().describe('The shell_id returned from a background Bash command'),
})

type Input = z.infer<typeof inputSchema>
type Output = {
  message: string
  shell_id: string
}

export const KillShellTool = {
  name: TOOL_NAME_FOR_PROMPT,
  async description() {
    return DESCRIPTION
  },
  userFacingName() {
    return 'Kill Shell'
  },
  inputSchema,
  isReadOnly() {
    return false
  },
  isConcurrencySafe() {
    return true
  },
  async isEnabled() {
    return true
  },
  needsPermissions() {
    return false
  },
  async prompt() {
    return DESCRIPTION
  },
  renderToolUseMessage({ shell_id }: Input) {
    return `Terminate background shell ${shell_id}`
  },
  renderToolUseRejectedMessage() {
    return <FallbackToolUseRejectedMessage />
  },
  renderToolResultMessage(output: Output) {
    return (
      <Box justifyContent="space-between" width="100%">
        <Box flexDirection="row">
          <Text>&nbsp;&nbsp;⎿ &nbsp;</Text>
          <Text bold>Shell killed</Text>
        </Box>
        <Cost costUSD={0} durationMs={0} debug={false} />
      </Box>
    )
  },
  renderResultForAssistant(output: Output) {
    return JSON.stringify(output)
  },
  async validateInput({ shell_id }: Input) {
    const bg = BunShell.getInstance().getBackgroundOutput(shell_id)
    if (!bg) {
      return {
        result: false,
        message: `No shell found with ID: ${shell_id}`,
        errorCode: 1,
      }
    }
    if (!bg.running) {
      return {
        result: false,
        message: `Shell ${shell_id} is not running, so cannot be killed`,
        errorCode: 2,
      }
    }
    return { result: true }
  },
  async *call({ shell_id }: Input) {
    const killed = BunShell.getInstance().killBackgroundShell(shell_id)
    const output: Output = {
      message: killed
        ? `Successfully killed shell: ${shell_id}`
        : `No shell found with ID: ${shell_id}`,
      shell_id,
    }
    yield {
      type: 'result',
      data: output,
      resultForAssistant: this.renderResultForAssistant(output),
    }
  },
} satisfies Tool<typeof inputSchema, Output>
