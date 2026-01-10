import { Box, Text } from 'ink'
import React from 'react'
import { z } from 'zod'
import { Tool } from '#core/tooling/Tool'
import {
  getPlanConversationKey,
  getPlanFilePath,
  readPlanFile,
} from '#core/utils/planMode'
import { EXIT_DESCRIPTION, EXIT_PROMPT, EXIT_TOOL_NAME } from './prompt'
import { getTheme } from '#core/utils/theme'
import { BLACK_CIRCLE } from '#core/constants/figures'

function getExitPlanModePlanText(conversationKey?: string): string {
  const { content } = readPlanFile(undefined, conversationKey)
  return (
    content || 'No plan found. Please write your plan to the plan file first.'
  )
}

export function __getExitPlanModePlanTextForTests(
  conversationKey?: string,
): string {
  return getExitPlanModePlanText(conversationKey)
}

const inputSchema = z.object({}).passthrough()

type Output = {
  plan: string
  isAgent: boolean
  filePath?: string
}

export const ExitPlanModeTool = {
  name: EXIT_TOOL_NAME,
  async description() {
    return EXIT_DESCRIPTION
  },
  userFacingName() {
    return ''
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
    return true
  },
  requiresUserInteraction() {
    return true
  },
  async prompt() {
    return EXIT_PROMPT
  },
  renderToolUseMessage() {
    return ''
  },
  renderToolUseRejectedMessage(
    _input: z.infer<typeof inputSchema>,
    options: { conversationKey?: string } = {},
  ) {
    const theme = getTheme()
    const conversationKey =
      typeof options.conversationKey === 'string' &&
      options.conversationKey.trim()
        ? options.conversationKey.trim()
        : undefined

    const { content } = readPlanFile(undefined, conversationKey)
    const plan = getExitPlanModePlanText(conversationKey)

    return (
      <Box flexDirection="column" marginTop={1} width="100%">
        <Box flexDirection="row">
          <Text>&nbsp;&nbsp;⎿ &nbsp;</Text>
          <Box flexDirection="column" width="100%">
            <Text color={theme.error}>User rejected Claude&apos;s plan:</Text>
            <Box
              borderStyle="round"
              borderColor={theme.planMode}
              borderDimColor
              paddingX={1}
              overflow="hidden"
            >
              <Text dimColor>{plan}</Text>
            </Box>
          </Box>
        </Box>
      </Box>
    )
  },
  renderToolResultMessage(output: Output) {
    const theme = getTheme()
    const planPath =
      typeof output.filePath === 'string' ? output.filePath : null
    const plan = output.plan || 'No plan found'

    return (
      <Box flexDirection="column" marginTop={1} width="100%">
        <Box flexDirection="row">
          <Text color={theme.planMode}>{BLACK_CIRCLE}</Text>
          <Text> User approved Claude&apos;s plan</Text>
        </Box>
        <Box flexDirection="row">
          <Text>&nbsp;&nbsp;⎿ &nbsp;</Text>
          <Box flexDirection="column">
            {planPath ? (
              <Text dimColor>Plan saved to: {planPath} · /plan to edit</Text>
            ) : null}
            <Text dimColor>{plan}</Text>
          </Box>
        </Box>
      </Box>
    )
  },
  renderResultForAssistant(output: Output) {
    if (output.isAgent) {
      return 'User has approved the plan. There is nothing else needed from you now. Please respond with "ok"'
    }

    return `User has approved your plan. You can now start coding. Start with updating your todo list if applicable

Your plan has been saved to: ${output.filePath}
You can refer back to it if needed during implementation.

## Approved Plan:
${output.plan}`
  },
  async *call(input: z.infer<typeof inputSchema>, context: any) {
    const conversationKey = getPlanConversationKey(context)
    const planFilePath = getPlanFilePath(context?.agentId, conversationKey)
    const { content, exists } = readPlanFile(context?.agentId, conversationKey)
    if (!exists) {
      throw new Error(
        `No plan file found at ${planFilePath}. Please write your plan to this file before calling ExitPlanMode.`,
      )
    }

    const isAgent = !!context?.agentId
    const output: Output = {
      plan: content,
      isAgent,
      filePath: planFilePath,
    }
    yield {
      type: 'result',
      data: output,
      resultForAssistant: this.renderResultForAssistant(output),
    }
  },
} satisfies Tool<typeof inputSchema, Output>
