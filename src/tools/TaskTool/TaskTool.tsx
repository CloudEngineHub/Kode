import { TextBlock } from '@anthropic-ai/sdk/resources/index.mjs'
import chalk from 'chalk'
import { last, memoize } from 'lodash-es'
import { EOL } from 'os'
import * as React from 'react'
import { Box, Text } from 'ink'
import { z } from 'zod'
import { Tool, ValidationResult } from '../../Tool'
import { FallbackToolUseRejectedMessage } from '../../components/FallbackToolUseRejectedMessage'
import { getAgentPrompt } from '../../constants/prompts'
import { getContext } from '../../context'
import { hasPermissionsToUseTool } from '../../permissions'
import { AssistantMessage, Message as MessageType, query } from '../../query'
import { formatDuration, formatNumber } from '../../utils/format'
import {
  getMessagesPath,
  getNextAvailableLogSidechainNumber,
  overwriteLog,
} from '../../utils/log.js'
import { applyMarkdown } from '../../utils/markdown'
import {
  createAssistantMessage,
  createUserMessage,
  getLastAssistantMessageId,
  INTERRUPT_MESSAGE,
  normalizeMessages,
} from '../../utils/messages.js'
import { getModelManager } from '../../utils/model'
import { getMaxThinkingTokens } from '../../utils/thinking'
import { getTheme } from '../../utils/theme'
import { generateAgentId } from '../../utils/agentStorage'
import { debug as debugLogger } from '../../utils/debugLogger'
import { getTaskTools, getPrompt } from './prompt'
import { TOOL_NAME } from './constants'

const inputSchema = z.object({
  description: z
    .string()
    .describe('A short (3-5 word) description of the task'),
  prompt: z.string().describe('The task for the agent to perform'),
  model_name: z
    .string()
    .optional()
    .describe(
      'Optional: Specific model name to use for this task. If not provided, uses the default task model pointer.',
    ),
})

export const TaskTool = {
  async prompt({ safeMode }) {
    return await getPrompt(safeMode)
  },
  name: TOOL_NAME,
  async description() {
    const modelManager = getModelManager()
    const availableModels = modelManager.getAllAvailableModelNames()
    const currentTaskModel =
      modelManager.getModelName('task') || '<Not configured>'

    if (availableModels.length === 0) {
      return `Launch a new agent to handle complex, multi-step tasks autonomously.

⚠️ No models configured. Use /model to configure models first.

Usage: Provide detailed task description for autonomous execution. The agent will return results in a single response.`
    }

    return `Launch a new agent to handle complex, multi-step tasks autonomously.

Available models: ${availableModels.join(', ')}

When to specify a model_name:
- Specify model_name for tasks requiring specific model capabilities  
- If not provided, uses current task default: '${currentTaskModel}'
- Use reasoning models for complex analysis
- Use quick models for simple operations

The model_name parameter accepts actual model names (like 'claude-3-5-sonnet-20241022', 'gpt-4', etc.)

Usage: Provide detailed task description for autonomous execution. The agent will return results in a single response.`
  },
  inputSchema,
  
  // 🔧 ULTRA FIX: Complete revert to original AgentTool pattern
  async *call(
    { description, prompt, model_name },
    {
      abortController,
      options: { safeMode = false, forkNumber, messageLogName, verbose },
      readFileTimestamps,
    },
  ) {
    const startTime = Date.now()
    const messages: MessageType[] = [createUserMessage(prompt)]
    const tools = await getTaskTools(safeMode)

    // We yield an initial message immediately so the UI
    // doesn't move around when messages start streaming back.
    yield {
      type: 'progress',
      content: createAssistantMessage(chalk.dim('Initializing…')),
      normalizedMessages: normalizeMessages(messages),
      tools,
    }

    const [taskPrompt, context, maxThinkingTokens] = await Promise.all([
      getAgentPrompt(),
      getContext(),
      getMaxThinkingTokens(messages),
    ])

    // Simple model resolution - match original AgentTool pattern  
    const modelToUse = model_name || 'task'
    
    // Inject model context to prevent self-referential expert consultations
    taskPrompt.push(`\nIMPORTANT: You are currently running as ${modelToUse}. You do not need to consult ${modelToUse} via AskExpertModel since you ARE ${modelToUse}. Complete tasks directly using your capabilities.`)

    let toolUseCount = 0

    const getSidechainNumber = memoize(() =>
      getNextAvailableLogSidechainNumber(messageLogName, forkNumber),
    )

    // Generate unique Task ID for this task execution
    const taskId = generateAgentId()

    // 🔧 ULTRA SIMPLIFIED: Exact original AgentTool pattern
    for await (const message of query(
      messages,
      taskPrompt,
      context,
      hasPermissionsToUseTool,
      {
        abortController,
        options: {
          safeMode,
          forkNumber,
          messageLogName,
          tools,
          commands: [],
          verbose,
          maxThinkingTokens,
          model: modelToUse,
        },
        messageId: getLastAssistantMessageId(messages),
        agentId: taskId,
        readFileTimestamps,
      },
    )) {
      messages.push(message)

      overwriteLog(
        getMessagesPath(messageLogName, forkNumber, getSidechainNumber()),
        messages.filter(_ => _.type !== 'progress'),
      )

      if (message.type !== 'assistant') {
        continue
      }

      const normalizedMessages = normalizeMessages(messages)
      for (const content of message.message.content) {
        if (content.type !== 'tool_use') {
          continue
        }

        toolUseCount++
        yield {
          type: 'progress',
          content: normalizedMessages.find(
            _ =>
              _.type === 'assistant' &&
              _.message.content[0]?.type === 'tool_use' &&
              _.message.content[0].id === content.id,
          ) as AssistantMessage,
          normalizedMessages,
          tools,
        }
      }
    }

    const normalizedMessages = normalizeMessages(messages)
    const lastMessage = last(messages)
    if (lastMessage?.type !== 'assistant') {
      throw new Error('Last message was not an assistant message')
    }

    // 🔧 CRITICAL FIX: Match original AgentTool interrupt handling pattern exactly
    if (
      lastMessage.message.content.some(
        _ => _.type === 'text' && _.text === INTERRUPT_MESSAGE,
      )
    ) {
      yield {
        type: 'progress',
        content: lastMessage,
        normalizedMessages,
        tools,
      }
    } else {
      const result = [
        toolUseCount === 1 ? '1 tool use' : `${toolUseCount} tool uses`,
        formatNumber(
          (lastMessage.message.usage.cache_creation_input_tokens ?? 0) +
            (lastMessage.message.usage.cache_read_input_tokens ?? 0) +
            lastMessage.message.usage.input_tokens +
            lastMessage.message.usage.output_tokens,
        ) + ' tokens',
        formatDuration(Date.now() - startTime),
      ]
      yield {
        type: 'progress',
        content: createAssistantMessage(`Done (${result.join(' · ')})`),
        normalizedMessages,
        tools,
      }
    }

    // Output is an AssistantMessage, but since TaskTool is a tool, it needs
    // to serialize its response to UserMessage-compatible content.
    const data = lastMessage.message.content.filter(_ => _.type === 'text')
    yield {
      type: 'result',
      data,
      normalizedMessages,
      resultForAssistant: this.renderResultForAssistant(data),
      tools,
    }
  },

  isReadOnly() {
    return true // for now...
  },
  isConcurrencySafe() {
    return true // Task tool supports concurrent execution in official implementation
  },
  async validateInput(input, context) {
    if (!input.description || typeof input.description !== 'string') {
      return {
        result: false,
        message: 'Description is required and must be a string',
      }
    }
    if (!input.prompt || typeof input.prompt !== 'string') {
      return {
        result: false,
        message: 'Prompt is required and must be a string',
      }
    }

    // Model validation - similar to Edit tool error handling
    if (input.model_name) {
      const modelManager = getModelManager()
      const availableModels = modelManager.getAllAvailableModelNames()

      if (!availableModels.includes(input.model_name)) {
        return {
          result: false,
          message: `Model '${input.model_name}' does not exist. Available models: ${availableModels.join(', ')}`,
          meta: {
            model_name: input.model_name,
            availableModels,
          },
        }
      }
    }

    return { result: true }
  },
  async isEnabled() {
    return true
  },
  userFacingName() {
    return 'Task'
  },
  needsPermissions() {
    return false
  },
  renderResultForAssistant(data: TextBlock[]) {
    return data.map(block => block.type === 'text' ? block.text : '').join('\n')
  },
  renderToolUseMessage({ description, prompt, model_name }, { verbose }) {
    if (!description || !prompt) return null

    const modelManager = getModelManager()
    const defaultTaskModel = modelManager.getModelName('task')
    const actualModel = model_name || defaultTaskModel
    const promptPreview =
      prompt.length > 80 ? prompt.substring(0, 80) + '...' : prompt

    if (verbose) {
      const theme = getTheme()
      return (
        <Box flexDirection="column">
          <Text bold color={theme.text}>
            🚀 Task ({actualModel}): {description}
          </Text>
          <Box
            marginTop={1}
            paddingLeft={2}
            borderLeftStyle="single"
            borderLeftColor={theme.secondaryBorder}
          >
            <Text color={theme.secondaryText}>{promptPreview}</Text>
          </Box>
        </Box>
      )
    }

    return `Task (${actualModel}): ${description}`
  },
  renderToolUseRejectedMessage() {
    return <FallbackToolUseRejectedMessage />
  },
  renderToolResultMessage(content) {
    const theme = getTheme()

    if (Array.isArray(content)) {
      const textBlocks = content.filter(block => block.type === 'text')
      const totalLength = textBlocks.reduce(
        (sum, block) => sum + block.text.length,
        0,
      )
      // 🔧 CRITICAL FIX: Use exact match for interrupt detection, not .includes()
      const isInterrupted = content.some(
        block =>
          block.type === 'text' && block.text === INTERRUPT_MESSAGE,
      )

      if (isInterrupted) {
        // 🔧 CRITICAL FIX: Match original system interrupt rendering exactly
        return (
          <Box flexDirection="row">
            <Text>&nbsp;&nbsp;⎿ &nbsp;</Text>
            <Text color={theme.error}>Interrupted by user</Text>
          </Box>
        )
      }

      return (
        <Box flexDirection="column">
          <Box justifyContent="space-between" width="100%">
            <Box flexDirection="row">
              <Text>&nbsp;&nbsp;⎿ &nbsp;</Text>
              <Text>Task completed</Text>
              {textBlocks.length > 0 && (
                <Text color={theme.secondaryText}>
                  {' '}
                  ({totalLength} characters)
                </Text>
              )}
            </Box>
          </Box>
        </Box>
      )
    }

    return (
      <Box flexDirection="row">
        <Text>&nbsp;&nbsp;⎿ &nbsp;</Text>
        <Text color={theme.secondaryText}>Task completed</Text>
      </Box>
    )
  },
} satisfies Tool<typeof inputSchema, TextBlock[]>