import { z } from 'zod'
import React from 'react'
import { Text } from 'ink'
import { Tool } from '#core/tooling/Tool'
import { DESCRIPTION, PROMPT } from './prompt'
import { getTheme } from '#core/utils/theme'
import { USE_BEDROCK, USE_VERTEX } from '#core/utils/model'

const thinkToolSchema = z.object({
  thought: z.string().describe('Your thoughts.'),
})

export const ThinkTool = {
  name: 'Think',
  userFacingName: () => 'Think',
  description: async () => DESCRIPTION,
  inputSchema: thinkToolSchema,
  isEnabled: async () => Boolean(process.env.THINK_TOOL),
  isReadOnly: () => true,
  isConcurrencySafe: () => true, // ThinkTool is read-only, safe for concurrent execution
  needsPermissions: () => false,
  prompt: async () => PROMPT,

  async *call(input, { messageId }) {
    yield {
      type: 'result',
      resultForAssistant: 'Your thought has been logged.',
      data: { thought: input.thought },
    }
  },

  // This is never called -- it's special-cased in AssistantToolUseMessage
  renderToolUseMessage(input) {
    return input.thought
  },

  renderToolUseRejectedMessage() {
    return (
      <Text>
        {'  '}⎿ &nbsp;
        <Text color={getTheme().error}>Thought cancelled</Text>
      </Text>
    )
  },

  renderResultForAssistant: () => 'Your thought has been logged.',
} satisfies Tool<typeof thinkToolSchema>
