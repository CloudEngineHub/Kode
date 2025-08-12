import * as React from 'react'
import { Box, Text } from 'ink'
import { z } from 'zod'
import { Tool, ValidationResult } from '../../Tool'
import { FallbackToolUseRejectedMessage } from '../../components/FallbackToolUseRejectedMessage'
import { getModelManager } from '../../utils/model'
import { getTheme } from '../../utils/theme'
import {
  createUserMessage,
  createAssistantMessage,
  INTERRUPT_MESSAGE,
} from '../../utils/messages'
import { logError } from '../../utils/log'
import {
  createExpertChatSession,
  loadExpertChatSession,
  getSessionMessages,
  addMessageToSession,
} from '../../utils/expertChatStorage'
import { queryLLM } from '../../services/claude'
import { debug as debugLogger } from '../../utils/debugLogger'
import { applyMarkdown } from '../../utils/markdown'

export const inputSchema = z.strictObject({
  question: z.string().describe('The question to ask the expert model'),
  expert_model: z
    .string()
    .describe(
      'The expert model to use (e.g., gpt-5, claude-3-5-sonnet-20241022)',
    ),
  chat_session_id: z
    .string()
    .describe(
      'Chat session ID: use "new" for new session or existing session ID',
    ),
})

type In = typeof inputSchema
export type Out = {
  chatSessionId: string
  expertModelName: string
  expertAnswer: string
}

export const AskExpertModelTool = {
  name: 'AskExpertModel',
  async description() {
    return 'Consults external AI models for specialized assistance and second opinions'
  },
  async prompt() {
    return `Consults external AI models for specialized assistance and second opinions. Maintains conversation history through persistent sessions.

When to use AskExpertModel tool:
- User explicitly requests a specific model ("use GPT-5 to...", "ask Claude about...", "consult Kimi for...")
- User seeks second opinions or specialized model expertise  
- User requests comparison between different model responses
- Complex questions requiring specific model capabilities

When NOT to use AskExpertModel tool:
- General questions that don't specify a particular model
- Tasks better suited for current model capabilities
- Simple queries not requiring external expertise

Usage notes:
1. Use exact model names as specified by the user
2. Sessions persist conversation context - use "new" for fresh conversations or provide existing session ID  
3. External models operate independently without access to current project context
4. Tool validates model availability and provides alternatives if model not found

IMPORTANT: Always use the precise model name the user requested. The tool will handle model availability and provide guidance for unavailable models.`
  },
  isReadOnly() {
    return true
  },
  isConcurrencySafe() {
    return true
  },
  inputSchema,
  userFacingName() {
    return 'AskExpertModel'
  },
  async isEnabled() {
    return true
  },
  needsPermissions(): boolean {
    return false
  },
  async validateInput({
    question,
    expert_model,
    chat_session_id,
  }): Promise<ValidationResult> {
    if (!question.trim()) {
      return { result: false, message: 'Question cannot be empty' }
    }

    if (!expert_model.trim()) {
      return { result: false, message: 'Expert model must be specified' }
    }

    if (!chat_session_id.trim()) {
      return {
        result: false,
        message:
          'Chat session ID must be specified (use "new" for new session)',
      }
    }

    // Validate that the model exists and is available
    try {
      const modelManager = getModelManager()
      const modelResolution = modelManager.resolveModelWithInfo(expert_model)

      if (!modelResolution.success) {
        const availableModels = modelManager.getAllAvailableModelNames()
        if (availableModels.length > 0) {
          return {
            result: false,
            message: `Model '${expert_model}' is not configured. Available models: ${availableModels.join(', ')}. Check if any available model closely matches the user's request (e.g., 'kimi' matches 'kimi-k2-0711-preview'). If there's a strong match, auto retry using the correct model name. If no close match exists, inform the user that '${expert_model}' needs to be configured using /model command.`,
          }
        } else {
          return {
            result: false,
            message: `Model '${expert_model}' not found and no models are currently configured in the system. Inform the user that models need to be configured first using the /model command.`,
          }
        }
      }
    } catch (error) {
      logError('Model validation error in AskExpertModelTool', error)
      return {
        result: false,
        message: `Failed to validate expert model '${expert_model}'. Please check your model configuration.`,
      }
    }

    return { result: true }
  },

  renderToolUseMessage(
    { question, expert_model, chat_session_id },
    { verbose },
  ) {
    if (!question || !expert_model) return null
    const isNewSession = chat_session_id === 'new'
    const sessionDisplay = isNewSession ? 'new session' : chat_session_id

    if (verbose) {
      const theme = getTheme()
      return (
        <Box flexDirection="column">
          <Text bold color={theme.text}>{expert_model}, {sessionDisplay}</Text>
          <Box
            borderStyle="single"
            borderColor="green"
            paddingX={1}
            paddingY={0}
            marginTop={1}
          >
            <Text color={theme.text}>
              {applyMarkdown(question)}
            </Text>
          </Box>
        </Box>
      )
    }
    return `${expert_model}, ${sessionDisplay}`
  },

  renderToolResultMessage(content) {
    const verbose = false // Set default value for verbose
    const theme = getTheme()

    if (typeof content === 'object' && content && 'expertAnswer' in content) {
      const expertResult = content as Out
      const isError = expertResult.expertAnswer.startsWith('❌')
      const isInterrupted = expertResult.chatSessionId === 'interrupted'

      if (isInterrupted) {
        return (
          <Box flexDirection="row">
            <Text>&nbsp;&nbsp;⎿ &nbsp;</Text>
            <Text color={theme.error}>[Expert consultation interrupted]</Text>
          </Box>
        )
      }

      const answerText = verbose 
        ? expertResult.expertAnswer.trim()
        : expertResult.expertAnswer.length > 120
          ? expertResult.expertAnswer.substring(0, 120) + '...'
          : expertResult.expertAnswer.trim()

      return (
        <Box flexDirection="column">
          <Box
            borderStyle="single" 
            borderColor="green" 
            paddingX={1} 
            paddingY={0}
            marginTop={1}
          >
            <Text color={isError ? theme.error : theme.text}>
              {isError ? answerText : applyMarkdown(answerText)}
            </Text>
          </Box>
        </Box>
      )
    }

    return (
      <Box flexDirection="row">
        <Text>&nbsp;&nbsp;⎿ &nbsp;</Text>
        <Text color={theme.secondaryText}>Expert consultation completed</Text>
      </Box>
    )
  },

  renderResultForAssistant(output: Out): string {
    return `[Expert consultation completed]
Expert Model: ${output.expertModelName}
Session ID: ${output.chatSessionId}
To continue this conversation with context preservation, use this Session ID in your next AskExpertModel call to maintain the full conversation history and context.

${output.expertAnswer}`
  },

  renderToolUseRejectedMessage() {
    return <FallbackToolUseRejectedMessage />
  },

  async *call(
    { question, expert_model, chat_session_id },
    { abortController, readFileTimestamps },
  ) {
    const expertModel = expert_model

    let sessionId: string
    let isInterrupted = false

    // Set up abort listener (following TaskTool pattern)
    const abortListener = () => {
      isInterrupted = true
    }
    abortController.signal.addEventListener('abort', abortListener)

    try {
      // Initial abort check
      if (abortController.signal.aborted) {
        return yield* this.handleInterrupt()
      }
      // Session management with error handling
      if (chat_session_id === 'new') {
        try {
          const session = createExpertChatSession(expertModel)
          sessionId = session.sessionId
        } catch (error) {
          logError('Failed to create new expert chat session', error)
          throw new Error('Failed to create new chat session')
        }
      } else {
        sessionId = chat_session_id
        try {
          const session = loadExpertChatSession(sessionId)
          if (!session) {
            // Session doesn't exist, create new one
            const newSession = createExpertChatSession(expertModel)
            sessionId = newSession.sessionId
          }
        } catch (error) {
          logError('Failed to load expert chat session', error)
          // Fallback: create new session
          try {
            const newSession = createExpertChatSession(expertModel)
            sessionId = newSession.sessionId
          } catch (createError) {
            logError(
              'Failed to create fallback expert chat session',
              createError,
            )
            throw new Error('Unable to create or load chat session')
          }
        }
      }

      // Check for cancellation before loading history
      if (isInterrupted || abortController.signal.aborted) {
        return yield* this.handleInterrupt()
      }

      // Load history and prepare messages with error handling
      let historyMessages: Array<{ role: string; content: string }>
      try {
        historyMessages = getSessionMessages(sessionId)
      } catch (error) {
        logError('Failed to load session messages', error)
        historyMessages = [] // Fallback to empty history
      }

      const messages = [...historyMessages, { role: 'user', content: question }]

      let systemMessages
      try {
        systemMessages = messages.map(msg =>
          msg.role === 'user'
            ? createUserMessage(msg.content)
            : createAssistantMessage(msg.content),
        )
      } catch (error) {
        logError('Failed to create system messages', error)
        throw new Error('Failed to prepare conversation messages')
      }

      // Check for cancellation before model call
      if (isInterrupted || abortController.signal.aborted) {
        return yield* this.handleInterrupt()
      }

      // Call model with comprehensive error handling and timeout
      let response
      try {
        // Debug: Log the model we're trying to use (using global debug logger)
        const modelManager = getModelManager()
        const modelResolution = modelManager.resolveModelWithInfo(expertModel)

        debugLogger.api('EXPERT_MODEL_RESOLUTION', {
          requestedModel: expertModel,
          success: modelResolution.success,
          profileName: modelResolution.profile?.name,
          profileModelName: modelResolution.profile?.modelName,
          provider: modelResolution.profile?.provider,
          isActive: modelResolution.profile?.isActive,
          error: modelResolution.error,
        })

        // Create a timeout promise to prevent hanging
        const timeoutMs = 60000 // 60 seconds timeout
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Expert model query timed out after ${timeoutMs/1000}s`))
          }, timeoutMs)
        })

        // Race between the query and timeout
        response = await Promise.race([
          queryLLM(
            systemMessages,
            [], // no system prompt - let expert model use its default behavior
            0, // no thinking tokens needed
            [], // no tools needed
            abortController.signal,
            {
              safeMode: false,
              model: expertModel,
              prependCLISysprompt: false, // KEY: avoid injecting CLI context
            },
          ),
          timeoutPromise
        ])
      } catch (error: any) {
        logError('Expert model query failed', error)

        // Check for specific error types
        if (
          error.name === 'AbortError' ||
          abortController.signal?.aborted ||
          isInterrupted
        ) {
          return yield* this.handleInterrupt()
        }

        if (error.message?.includes('timed out')) {
          throw new Error(
            `Expert model '${expertModel}' timed out. This often happens with slower APIs. Try again or use a different model.`,
          )
        }

        if (error.message?.includes('rate limit')) {
          throw new Error(
            'Rate limit exceeded for expert model. Please try again later.',
          )
        }

        if (error.message?.includes('invalid api key')) {
          throw new Error(
            'Invalid API key for expert model. Please check your configuration.',
          )
        }

        if (
          error.message?.includes('model not found') ||
          error.message?.includes('Failed to resolve model')
        ) {
          // Provide helpful model guidance in runtime errors too
          try {
            const modelManager = getModelManager()
            const availableModels = modelManager.getAllAvailableModelNames()
            if (availableModels.length > 0) {
              throw new Error(
                `Model '${expertModel}' is not configured. Available models: ${availableModels.join(', ')}. Check if any available model closely matches the user's request (e.g., 'kimi' matches 'kimi-k2-0711-preview'). If there's a strong match, auto retry using the correct model name. If no close match exists, inform the user that '${expertModel}' needs to be configured using /model command.`,
              )
            } else {
              throw new Error(
                `Model '${expertModel}' not found and no models are currently configured in the system. Inform the user that models need to be configured first using the /model command.`,
              )
            }
          } catch (modelError) {
            // If we can't get model list, fall back to simple error
            throw new Error(
              `Model '${expertModel}' not found. Please check model configuration or inform user about the issue.`,
            )
          }
        }

        // Generic fallback
        throw new Error(
          `Expert model query failed: ${error.message || 'Unknown error'}`,
        )
      }

      // Extract answer with error handling
      let expertAnswer: string
      try {
        if (!response?.message?.content) {
          throw new Error('No content in expert response')
        }

        expertAnswer = response.message.content
          .filter(block => block.type === 'text')
          .map(block => (block as any).text)
          .join('\n')

        if (!expertAnswer.trim()) {
          throw new Error('Expert response was empty')
        }
      } catch (error) {
        logError('Failed to extract expert answer', error)
        throw new Error('Failed to process expert response')
      }

      // Save conversation with error handling
      try {
        addMessageToSession(sessionId, 'user', question)
        addMessageToSession(sessionId, 'assistant', expertAnswer)
      } catch (error) {
        logError('Failed to save conversation to session', error)
        // Don't throw here - we got a valid response, saving is non-critical
      }

      const result: Out = {
        chatSessionId: sessionId,
        expertModelName: expertModel,
        expertAnswer: expertAnswer,
      }

      yield {
        type: 'result',
        data: result,
        resultForAssistant: this.renderResultForAssistant(result),
      }
    } catch (error: any) {
      // Check if error is due to cancellation
      if (
        error.name === 'AbortError' ||
        abortController.signal?.aborted ||
        isInterrupted
      ) {
        return yield* this.handleInterrupt()
      }

      logError('AskExpertModelTool execution failed', error)

      // Ensure we have a valid sessionId for error response
      const errorSessionId = sessionId || 'error-session'

      const errorMessage =
        error.message || 'Expert consultation failed with unknown error'
      const result: Out = {
        chatSessionId: errorSessionId,
        expertModelName: expertModel,
        expertAnswer: `❌ ${errorMessage}`,
      }

      yield {
        type: 'result',
        data: result,
        resultForAssistant: this.renderResultForAssistant(result),
      }
    } finally {
      // Clean up event listener
      abortController.signal.removeEventListener('abort', abortListener)
    }
  },

  // Unified interrupt handling method (following TaskTool pattern)
  async *handleInterrupt() {
    yield {
      type: 'result',
      data: {
        chatSessionId: 'interrupted',
        expertModelName: 'cancelled',
        expertAnswer: INTERRUPT_MESSAGE,
      },
      resultForAssistant: INTERRUPT_MESSAGE,
    }
  },
}
