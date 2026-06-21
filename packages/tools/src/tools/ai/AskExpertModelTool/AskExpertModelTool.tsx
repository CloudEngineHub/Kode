import { Box, Text } from 'ink'
import React from 'react'
import { z } from 'zod'
import type { ToolUseContext, ValidationResult } from '#core/tooling/Tool'
import { Tool } from '#core/tooling/Tool'
import { applyMarkdown } from '#core/utils/markdown'
import { getModelManager } from '#core/utils/model'
import { getTheme } from '#core/utils/theme'
import { callAskExpertModelTool } from './call'
import { DESCRIPTION, PROMPT } from './prompt'

export const inputSchema = z.strictObject({
  question: z
    .string()
    .describe(
      'A fully self-contained question (include all background context, constraints, and a clear ask).',
    ),
  expert_model: z
    .string()
    .describe(
      'The expert model to use (e.g., gpt-5, claude-3-5-sonnet-20241022)',
    ),
  chat_session_id: z
    .string()
    .describe('Use "new" for a new session, or an existing session ID.'),
})

type Input = z.infer<typeof inputSchema>

export type Out = {
  chatSessionId: string
  expertModelName: string
  expertAnswer: string
}

function normalizeModelName(modelName: string): string {
  return modelName.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function getCurrentModelName(context?: ToolUseContext): string {
  if (typeof context?.options?.model === 'string') return context.options.model
  const modelName = getModelManager().getModelName('main')
  return modelName ?? ''
}

async function validateInput(
  input: Input,
  context?: ToolUseContext,
): Promise<ValidationResult> {
  const question = input.question.trim()
  const expertModel = input.expert_model.trim()
  const sessionId = input.chat_session_id.trim()

  if (!question) return { result: false, message: 'Question cannot be empty' }
  if (!expertModel)
    return { result: false, message: 'Expert model must be specified' }
  if (!sessionId) {
    return {
      result: false,
      message: 'Chat session ID must be specified (use "new" for new session)',
    }
  }

  const currentModel = getCurrentModelName(context)
  if (
    currentModel &&
    normalizeModelName(currentModel) === normalizeModelName(expertModel)
  ) {
    return {
      result: false,
      message: `You are already running as ${currentModel}. Please choose a different model to consult.`,
    }
  }

  const modelManager = getModelManager()
  const resolved = modelManager.resolveModelWithInfo(expertModel)
  if (!resolved.success) {
    const available = modelManager.getAllAvailableModelNames()
    return {
      result: false,
      message:
        available.length > 0
          ? `Model '${expertModel}' is not configured. Available models: ${available.join(', ')}. Configure it via /model.`
          : `Model '${expertModel}' is not configured and no models are currently available. Configure a model via /model first.`,
    }
  }

  return { result: true }
}

export const AskExpertModelTool = {
  name: 'AskExpertModel',
  async description() {
    return DESCRIPTION
  },
  async prompt() {
    return PROMPT
  },
  inputSchema,
  userFacingName() {
    return 'AskExpertModel'
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
  validateInput,
  renderToolUseMessage(
    { question, expert_model, chat_session_id },
    { verbose },
  ) {
    if (!expert_model) return null

    const isNewSession = chat_session_id === 'new'
    const sessionLabel = isNewSession
      ? 'new session'
      : `session ${chat_session_id.slice(0, 8)}…`
    const theme = getTheme()

    if (!verbose) {
      return (
        <Box flexDirection="column">
          <Text bold color="yellow">
            {expert_model}{' '}
          </Text>
          <Text color={theme.secondaryText} dimColor>
            ({sessionLabel})
          </Text>
        </Box>
      )
    }

    const preview =
      question.length > 300 ? `${question.slice(0, 300)}…` : question
    return (
      <Box flexDirection="column">
        <Text bold color="yellow">
          {expert_model}
        </Text>
        <Text color={theme.secondaryText}>{sessionLabel}</Text>
        <Box marginTop={1}>
          <Text color={theme.text}>{preview}</Text>
        </Box>
      </Box>
    )
  },
  renderToolResultMessage(output: Out, { verbose }) {
    const theme = getTheme()
    const answer = (output.expertAnswer ?? '').trim()
    const shown = verbose
      ? answer
      : answer.length > 800
        ? `${answer.slice(0, 800)}…`
        : answer

    return (
      <Box flexDirection="column">
        <Text bold color={theme.text}>
          Response from {output.expertModelName}:
        </Text>
        <Box marginTop={1}>
          <Text color={theme.text}>{applyMarkdown(shown)}</Text>
        </Box>
        <Box marginTop={1}>
          <Text color={theme.secondaryText} dimColor>
            Session: {output.chatSessionId.slice(0, 8)}
          </Text>
        </Box>
      </Box>
    )
  },
  renderToolUseRejectedMessage() {
    const theme = getTheme()
    return (
      <Box flexDirection="row">
        <Text color={theme.secondaryText} dimColor>
          Expert consultation cancelled
        </Text>
      </Box>
    )
  },
  renderResultForAssistant(output: Out): string {
    return `[Expert consultation completed]
Expert Model: ${output.expertModelName}
Session ID: ${output.chatSessionId}
To continue this conversation, reuse this Session ID in the next AskExpertModel call.

${output.expertAnswer}`
  },
  async *call(
    input: Input,
    { abortController, readFileTimestamps }: ToolUseContext,
  ) {
    const normalizedInput = {
      question: String(input.question ?? ''),
      expert_model: String(input.expert_model ?? ''),
      chat_session_id: String(input.chat_session_id ?? ''),
    }
    yield* callAskExpertModelTool(
      normalizedInput,
      { abortController, readFileTimestamps },
      output => this.renderResultForAssistant(output),
    )
  },
} satisfies Tool<typeof inputSchema, Out>
