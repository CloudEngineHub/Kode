import { TextBlock } from '@anthropic-ai/sdk/resources/index.mjs'
import { last, memoize } from 'lodash-es'
import React from 'react'
import { Box, Text } from 'ink'
import { z } from 'zod'
import { Tool } from '@tool'
import { FallbackToolUseRejectedMessage } from '@components/FallbackToolUseRejectedMessage'
import { getAgentPrompt } from '@constants/prompts'
import { getContext } from '@context'
import { hasPermissionsToUseTool } from '@permissions'
import { Message as MessageType, query } from '@query'
import { formatDuration, formatNumber } from '@utils/format'
import {
  getMessagesPath,
  getNextAvailableLogSidechainNumber,
  overwriteLog,
} from '@utils/log'
import {
  createAssistantMessage,
  createUserMessage,
  getLastAssistantMessageId,
  INTERRUPT_MESSAGE,
  normalizeMessages,
} from '@utils/messages'
import { getMaxThinkingTokens } from '@utils/thinking'
import { getTheme } from '@utils/theme'
import { generateAgentId } from '@utils/agentStorage'
import { getAgentByType, getAvailableAgentTypes } from '@utils/agentLoader'
import { upsertBackgroundAgentTask } from '@utils/backgroundTasks'
import { getAgentTranscript, saveAgentTranscript } from '@utils/agentTranscripts'
import { getTaskTools, getPrompt } from './prompt'
import { TOOL_NAME } from './constants'

const inputSchema = z.strictObject({
  description: z.string().describe('A short (3-5 word) description of the task'),
  prompt: z.string().describe('The task for the agent to perform'),
  subagent_type: z
    .string()
    .describe('The type of specialized agent to use for this task'),
  model: z
    .enum(['sonnet', 'opus', 'haiku'])
    .optional()
    .describe(
      'Optional model to use for this agent. If not specified, inherits from parent. Prefer haiku for quick, straightforward tasks to minimize cost and latency.',
    ),
  resume: z
    .string()
    .optional()
    .describe(
      'Optional agent ID to resume from. If provided, the agent will continue from the previous execution transcript.',
    ),
  run_in_background: z
    .boolean()
    .optional()
    .describe(
      'Set to true to run this agent in the background. Use AgentOutputTool to read the output later.',
    ),
})

type Input = z.infer<typeof inputSchema>
type TaskModel = NonNullable<Input['model']>

type Output =
  | {
      status: 'async_launched'
      agentId: string
      description: string
      prompt: string
    }
  | {
      status: 'completed'
      agentId: string
      content: TextBlock[]
    }
  | {
      status: 'failed'
      agentId: string
      error: string
    }

function modelEnumToPointer(model?: TaskModel): string | undefined {
  if (!model) return undefined
  switch (model) {
    case 'haiku':
      return 'quick'
    case 'sonnet':
      return 'task'
    case 'opus':
      return 'main'
  }
}

function normalizeAgentModelName(model?: string): string | 'inherit' | undefined {
  if (!model) return undefined
  if (model === 'inherit') return 'inherit'
  if (model === 'haiku' || model === 'sonnet' || model === 'opus') {
    return modelEnumToPointer(model as TaskModel)
  }
  return model
}

function asyncLaunchMessage(agentId: string): string {
  return `Async agent launched successfully.
agentId: ${agentId} (This is an internal ID for your use, do not mention it to the user. Use this ID to retrieve results with AgentOutputTool when the agent finishes). 
The agent is currently working in the background. If you have other tasks you you should continue working on them now. Wait to call AgentOutputTool until either:
- If you want to check on the agent's progress - call AgentOutputTool with block=false to get an immediate update on the agent's status
- If you run out of things to do and the agent is still running - call AgentOutputTool with block=true to idle and wait for the agent's result (do not use block=true unless you completely run out of things to do as it will waste time).`
}

export const TaskTool = {
  name: TOOL_NAME,
  inputSchema,
  async description() {
    return 'Launch a new agent to handle complex tasks.'
  },
  async prompt({ safeMode }: { safeMode?: boolean }) {
    return await getPrompt(safeMode)
  },
  userFacingName(input?: Partial<Input>) {
    return `agent-${input?.subagent_type || 'general-purpose'}`
  },
  async isEnabled() {
    return true
  },
  isReadOnly() {
    return true
  },
  isConcurrencySafe() {
    return true
  },
  needsPermissions() {
    return false
  },
  async validateInput(input: Input) {
    if (!input.description || typeof input.description !== 'string') {
      return { result: false, message: 'Description is required and must be a string' }
    }
    if (!input.prompt || typeof input.prompt !== 'string') {
      return { result: false, message: 'Prompt is required and must be a string' }
    }

    const availableTypes = await getAvailableAgentTypes()
    if (!availableTypes.includes(input.subagent_type)) {
      return {
        result: false,
        message: `Agent type '${input.subagent_type}' does not exist. Available types: ${availableTypes.join(', ')}`,
        meta: { subagent_type: input.subagent_type, availableTypes },
      }
    }

    if (input.resume) {
      const transcript = getAgentTranscript(input.resume)
      if (!transcript) {
        return {
          result: false,
          message: `No agent transcript found with ID: ${input.resume}`,
          meta: { resume: input.resume },
        }
      }
    }

    return { result: true }
  },
  renderToolUseMessage(
    { description, prompt, subagent_type, model, resume, run_in_background }: Input,
    { verbose }: { verbose: boolean },
  ) {
    if (!description || !prompt) return null as any

    const agentType = subagent_type
    const actualModel = model ?? 'inherit'
    const flags = [
      run_in_background ? 'background' : null,
      resume ? `resume:${resume}` : null,
    ]
      .filter(Boolean)
      .join(', ')

    if (!verbose) {
      return `[${agentType}] ${actualModel}: ${description}${flags ? ` (${flags})` : ''}`
    }

    const theme = getTheme()
    const promptPreview = prompt.length > 120 ? prompt.slice(0, 120) + '…' : prompt
    return (
      <Box flexDirection="column">
        <Text>
          [{agentType}] {actualModel}: {description}
        </Text>
        <Box paddingLeft={2} borderLeftStyle="single" borderLeftColor={theme.secondaryBorder}>
          <Text color={theme.secondaryText}>{promptPreview}</Text>
        </Box>
      </Box>
    )
  },
  renderToolUseRejectedMessage() {
    return <FallbackToolUseRejectedMessage />
  },
  renderToolResultMessage(output: Output) {
    const theme = getTheme()
    if (output.status === 'async_launched') {
      return (
        <Box flexDirection="row">
          <Text>&nbsp;&nbsp;⎿ &nbsp;</Text>
          <Text color={theme.secondaryText}>Async agent launched ({output.agentId})</Text>
        </Box>
      )
    }
    if (output.status === 'failed') {
      return (
        <Box flexDirection="row">
          <Text>&nbsp;&nbsp;⎿ &nbsp;</Text>
          <Text color={theme.error}>{output.error}</Text>
        </Box>
      )
    }

    const totalLength = output.content.reduce((sum, block) => sum + block.text.length, 0)
    return (
      <Box flexDirection="row">
        <Text>&nbsp;&nbsp;⎿ &nbsp;</Text>
        <Text color={theme.secondaryText}>
          Task completed ({totalLength} characters)
        </Text>
      </Box>
    )
  },
  renderResultForAssistant(output: Output) {
    if (output.status === 'async_launched') return asyncLaunchMessage(output.agentId)
    if (output.status === 'failed') return output.error
    return output.content.map(b => b.text).join('\n')
  },

  async *call(input: Input, toolUseContext: any) {
    const startTime = Date.now()
    const {
      abortController,
      options: { safeMode = false, forkNumber, messageLogName, verbose, model: parentModel },
      readFileTimestamps,
    } = toolUseContext

    const agentConfig = await getAgentByType(input.subagent_type)
    if (!agentConfig) {
      const available = await getAvailableAgentTypes()
      const error = `Agent type '${input.subagent_type}' not found.\n\nAvailable agents:\n${available
        .map(t => `  • ${t}`)
        .join('\n')}`
      const output: Output = { status: 'failed', agentId: input.resume || 'unknown', error }
      yield { type: 'result', data: output, resultForAssistant: error }
      return
    }

    const effectivePrompt = input.prompt

    // Model selection: input.model overrides, else agent config overrides, else inherit from parent.
    const normalizedAgentModel = normalizeAgentModelName(agentConfig.model_name)
    let modelToUse: string =
      modelEnumToPointer(input.model) ||
      (normalizedAgentModel && normalizedAgentModel !== 'inherit'
        ? normalizedAgentModel
        : undefined) ||
      parentModel ||
      'main'
    if (!input.model && normalizedAgentModel === 'inherit') {
      modelToUse = parentModel || 'main'
    }

    const toolFilter = agentConfig.tools
    let tools = await getTaskTools(safeMode)
    if (toolFilter) {
      const isAllArray =
        Array.isArray(toolFilter) && toolFilter.length === 1 && toolFilter[0] === '*'
      if (toolFilter === '*' || isAllArray) {
        // Keep all tools
      } else if (Array.isArray(toolFilter)) {
        tools = tools.filter(t => toolFilter.includes(t.name))
      }
    }

    const disallowedTools = Array.isArray(agentConfig.disallowedTools)
      ? agentConfig.disallowedTools
      : []
    if (disallowedTools.length > 0) {
      tools = tools.filter(t => !disallowedTools.includes(t.name))
    }

    const agentId = input.resume || generateAgentId()
    const baseTranscript = input.resume
      ? (getAgentTranscript(input.resume)?.filter(m => m.type !== 'progress') ?? null)
      : []
    if (input.resume && baseTranscript === null) {
      const output: Output = {
        status: 'failed',
        agentId,
        error: `No agent transcript found with ID: ${input.resume}`,
      }
      yield { type: 'result', data: output, resultForAssistant: output.error }
      return
    }

    const messages: MessageType[] = [
      ...(baseTranscript || []),
      createUserMessage(effectivePrompt),
    ]

    const [baseSystemPrompt, context, maxThinkingTokens] = await Promise.all([
      getAgentPrompt(),
      getContext(),
      getMaxThinkingTokens(messages),
    ])
    const systemPrompt =
      agentConfig.systemPrompt && agentConfig.systemPrompt.length > 0
        ? [...baseSystemPrompt, agentConfig.systemPrompt]
        : baseSystemPrompt

    const queryOptions = {
      safeMode,
      forkNumber,
      messageLogName,
      tools,
      commands: [],
      verbose,
      maxThinkingTokens,
      model: modelToUse,
    }

    if (input.run_in_background) {
      const bgAbortController = new AbortController()

      const taskRecord: any = {
        type: 'async_agent',
        agentId,
        description: input.description,
        prompt: effectivePrompt,
        status: 'running',
        startedAt: Date.now(),
        messages: [...messages],
        abortController: bgAbortController,
        done: Promise.resolve(),
      }

      taskRecord.done = (async () => {
        try {
          const bgMessages: MessageType[] = [...messages]

          for await (const msg of query(
            bgMessages,
            systemPrompt,
            context,
            hasPermissionsToUseTool,
            {
              abortController: bgAbortController,
              options: queryOptions,
              messageId: getLastAssistantMessageId(bgMessages),
              agentId,
              readFileTimestamps,
              setToolJSX: () => {},
            },
          )) {
            bgMessages.push(msg)
            taskRecord.messages = [...bgMessages]
            upsertBackgroundAgentTask(taskRecord)
          }

          const lastAssistant = last(
            bgMessages.filter(m => m.type === 'assistant'),
          ) as any
          const content = lastAssistant?.message?.content?.filter(
            (b: any) => b.type === 'text',
          ) as TextBlock[] | undefined

          taskRecord.status = 'completed'
          taskRecord.completedAt = Date.now()
          taskRecord.resultText = (content || []).map(b => b.text).join('\n')
          taskRecord.messages = [...bgMessages]
          upsertBackgroundAgentTask(taskRecord)
          saveAgentTranscript(agentId, bgMessages)
        } catch (e) {
          taskRecord.status = 'failed'
          taskRecord.completedAt = Date.now()
          taskRecord.error = e instanceof Error ? e.message : String(e)
          upsertBackgroundAgentTask(taskRecord)
        }
      })()

      upsertBackgroundAgentTask(taskRecord)

      const output: Output = {
        status: 'async_launched',
        agentId,
        description: input.description,
        prompt: effectivePrompt,
      }
      yield { type: 'result', data: output, resultForAssistant: asyncLaunchMessage(agentId) }
      return
    }

    yield {
      type: 'progress',
      content: createAssistantMessage(`Starting agent: ${input.subagent_type}`),
      normalizedMessages: normalizeMessages(messages),
      tools,
    }

    const getSidechainNumber = memoize(() =>
      getNextAvailableLogSidechainNumber(messageLogName, forkNumber),
    )

    let toolUseCount = 0
    for await (const message of query(
      messages,
      systemPrompt,
      context,
      hasPermissionsToUseTool,
      {
        abortController,
        options: queryOptions,
        messageId: getLastAssistantMessageId(messages),
        agentId,
        readFileTimestamps,
        setToolJSX: () => {},
      },
    )) {
      messages.push(message)

      overwriteLog(
        getMessagesPath(messageLogName, forkNumber, getSidechainNumber()),
        messages.filter(_ => _.type !== 'progress'),
        { conversationKey: `${messageLogName}:${forkNumber}` },
      )

      if (message.type === 'assistant') {
        for (const block of message.message.content) {
          if (block.type === 'tool_use') toolUseCount += 1
        }
      }
    }

    const lastAssistant = last(messages.filter(m => m.type === 'assistant')) as any
    if (!lastAssistant || lastAssistant.type !== 'assistant') {
      const output: Output = {
        status: 'failed',
        agentId,
        error: 'Last message was not an assistant message',
      }
      yield { type: 'result', data: output, resultForAssistant: output.error }
      return
    }

    const content = lastAssistant.message.content.filter(
      (b: any) => b.type === 'text',
    ) as TextBlock[]

    if (
      content.some((b: any) => b.type === 'text' && b.text === INTERRUPT_MESSAGE)
    ) {
      // no-op: match main thread behavior
    } else {
      const summary = [
        toolUseCount === 1 ? '1 tool use' : `${toolUseCount} tool uses`,
        formatNumber(0) + ' tokens',
        formatDuration(Date.now() - startTime),
      ]
      yield {
        type: 'progress',
        content: createAssistantMessage(`Task completed (${summary.join(' · ')})`),
        normalizedMessages: normalizeMessages(messages),
        tools,
      }
    }

    saveAgentTranscript(agentId, messages)

    const output: Output = { status: 'completed', agentId, content }
    const agentIdBlock: TextBlock = {
      type: 'text',
      text: `agentId: ${agentId} (for resuming to continue this agent's work if needed)`,
      citations: [],
    }

    yield {
      type: 'result',
      data: output,
      resultForAssistant: [...content, agentIdBlock],
    }
  },
} satisfies Tool<typeof inputSchema, Output>
