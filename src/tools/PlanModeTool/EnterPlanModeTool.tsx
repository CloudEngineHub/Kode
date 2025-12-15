import { Box, Text } from 'ink'
import React from 'react'
import { z } from 'zod'
import { Cost } from '@components/Cost'
import { Tool } from '@tool'
import { enterPlanMode } from '@utils/planMode'
import { ENTER_DESCRIPTION, ENTER_PROMPT, ENTER_TOOL_NAME } from './prompt'
import { getTheme } from '@utils/theme'

const inputSchema = z.strictObject({})

type Output = {
  message: string
}

export const EnterPlanModeTool = {
  name: ENTER_TOOL_NAME,
  async description() {
    return ENTER_DESCRIPTION
  },
  userFacingName() {
    return ''
  },
  inputSchema,
  isReadOnly() {
    return true
  },
  isConcurrencySafe() {
    return true
  },
  async isEnabled() {
    return true
  },
  needsPermissions() {
    return true
  },
  requiresUserInteraction() {
    return true
  },
  async prompt() {
    return ENTER_PROMPT
  },
  renderToolUseMessage() {
    return ''
  },
  renderToolUseRejectedMessage() {
    return (
      <Box flexDirection="row" marginTop={1} width="100%">
        <Text>&nbsp;&nbsp;⎿ &nbsp;</Text>
        <Text color={getTheme().secondaryText}>User declined to enter plan mode</Text>
      </Box>
    )
  },
  renderToolResultMessage(output: Output) {
    return (
      <Box flexDirection="column" marginTop={1} width="100%">
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexDirection="row">
            <Text>&nbsp;&nbsp;⎿ &nbsp;</Text>
            <Text bold>Entered plan mode</Text>
          </Box>
          <Cost costUSD={0} durationMs={0} debug={false} />
        </Box>
        <Box paddingLeft={4}>
          <Text dimColor>
            Claude is now exploring and designing an implementation approach.
          </Text>
        </Box>
      </Box>
    )
  },
  renderResultForAssistant(output: Output) {
    return `${output.message}

In plan mode, you should:
1. Thoroughly explore the codebase to understand existing patterns
2. Identify similar features and architectural approaches
3. Consider multiple approaches and their trade-offs
4. Use AskUserQuestion if you need to clarify the approach
5. Design a concrete implementation strategy
6. When ready, use ExitPlanMode to present your plan for approval

Remember: DO NOT write or edit any files yet. This is a read-only exploration and planning phase.`
  },
  async *call(_input: z.infer<typeof inputSchema>, context: any) {
    if (context?.agentId) {
      throw new Error('EnterPlanMode tool cannot be used in agent contexts')
    }

    enterPlanMode(context)
    const output: Output = {
      message:
        'Entered plan mode. You should now focus on exploring the codebase and designing an implementation approach.',
    }
    yield {
      type: 'result',
      data: output,
      resultForAssistant: this.renderResultForAssistant(output),
    }
  },
} satisfies Tool<typeof inputSchema, Output>
