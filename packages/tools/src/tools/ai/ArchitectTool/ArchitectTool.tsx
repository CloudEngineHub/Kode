import type { TextBlock } from '@anthropic-ai/sdk/resources/index.mjs'
import { Box, Text } from 'ink'
import * as React from 'react'
import { z } from 'zod'
import { highlight } from 'cli-highlight'
import type { Tool } from '#core/tooling/Tool'
import { getContext } from '#core/context'
import { Message, query } from '#core/query'
import { lastX } from '#core/utils/generators'
import { createUserMessage } from '#core/utils/messages'
import { BashTool } from '#tools/tools/system/BashTool/BashTool'
import { FileReadTool } from '#tools/tools/filesystem/FileReadTool/FileReadTool'
import { FileWriteTool } from '#tools/tools/filesystem/FileWriteTool/FileWriteTool'
import { GlobTool } from '#tools/tools/filesystem/GlobTool/GlobTool'
import { GrepTool } from '#tools/tools/search/GrepTool/GrepTool'
import { ARCHITECT_SYSTEM_PROMPT, DESCRIPTION } from './prompt'

const FS_EXPLORATION_TOOLS: Tool[] = [
  BashTool,
  FileReadTool,
  FileWriteTool,
  GlobTool,
  GrepTool,
]

const inputSchema = z.strictObject({
  prompt: z
    .string()
    .describe('The technical request or coding task to analyze'),
  context: z
    .string()
    .describe('Optional context from previous conversation or system state')
    .optional(),
})

export const ArchitectTool = {
  name: 'Architect',
  async description() {
    return DESCRIPTION
  },
  inputSchema,
  isReadOnly() {
    return true
  },
  isConcurrencySafe() {
    return true // ArchitectTool is read-only, safe for concurrent execution
  },
  userFacingName() {
    return 'Architect'
  },
  async isEnabled() {
    return false
  },
  needsPermissions() {
    return false
  },
  async *call({ prompt, context }, toolUseContext) {
    const content = context
      ? `<context>${context}</context>\n\n${prompt}`
      : prompt

    const userMessage = createUserMessage(content)

    const messages: Message[] = [userMessage]

    // We only allow the file exploration tools to be used in the architect tool
    const allowedTools = (toolUseContext.options?.tools ?? []).filter(_ =>
      FS_EXPLORATION_TOOLS.map(_ => _.name).includes(_.name),
    )

    // Create a dummy canUseTool function since this tool controls its own tool usage
    const canUseTool = async () => ({ result: true as const })

    const lastResponse = await lastX(
      query(
        messages,
        [ARCHITECT_SYSTEM_PROMPT],
        await getContext(),
        canUseTool,
        {
          ...toolUseContext,
          setToolJSX: () => {}, // Dummy function since ArchitectTool doesn't use UI
          options: {
            commands: toolUseContext.options?.commands || [],
            forkNumber: toolUseContext.options?.forkNumber || 0,
            messageLogName: toolUseContext.options?.messageLogName || 'default',
            verbose: toolUseContext.options?.verbose || false,
            safeMode: toolUseContext.options?.safeMode || false,
            maxThinkingTokens: toolUseContext.options?.maxThinkingTokens || 0,
            ...toolUseContext.options,
            tools: allowedTools,
            persistSession: false,
          },
        },
      ),
    )

    if (lastResponse.type !== 'assistant') {
      throw new Error(`Invalid response from API`)
    }

    const data = lastResponse.message.content.filter(_ => _.type === 'text')
    yield {
      type: 'result',
      data,
      resultForAssistant: this.renderResultForAssistant(data),
    }
  },
  async prompt() {
    return DESCRIPTION
  },
  renderResultForAssistant(data: TextBlock[]): string {
    return data.map(block => block.text).join('\n')
  },
  renderToolUseMessage(input) {
    return Object.entries(input)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join(', ')
  },
  renderToolResultMessage(content) {
    const text = content.map(_ => _.text).join('\n')
    return (
      <Box flexDirection="column" gap={1}>
        <Text>{highlight(text, { language: 'markdown' })}</Text>
      </Box>
    )
  },
  renderToolUseRejectedMessage() {
    return null
  },
} satisfies Tool<typeof inputSchema, TextBlock[]>
