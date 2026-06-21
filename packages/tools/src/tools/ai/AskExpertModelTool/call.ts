import { logError } from '#core/utils/log'
import { debug as debugLogger } from '#core/utils/debugLogger'
import { getModelManager } from '#core/utils/model'
import type { AssistantMessage } from '#core/query'
import {
  addMessageToSession,
  createExpertChatSession,
  getSessionMessages,
  loadExpertChatSession,
} from '#core/utils/expertChatStorage'
import {
  createAssistantMessage,
  createUserMessage,
  INTERRUPT_MESSAGE,
} from '#core/utils/messages'
import { queryLLM } from '#core/ai/llmLazy'
import type { Out } from './AskExpertModelTool'

type Input = {
  question: string
  expert_model: string
  chat_session_id: string
}

type Context = {
  abortController: AbortController
  readFileTimestamps: Record<string, number>
}

type ToolYield =
  | { type: 'progress'; content: AssistantMessage }
  | { type: 'result'; data: Out; resultForAssistant: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object'
}

function extractAssistantText(message: AssistantMessage): string {
  const content = message?.message?.content as unknown

  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  const parts: string[] = []
  for (const block of content) {
    if (!isRecord(block)) continue
    if (block.type === 'text' && typeof block.text === 'string') {
      parts.push(block.text)
    }
  }
  return parts.join('\n')
}

function isInterrupted(
  error: unknown,
  abortController: AbortController,
  interruptedFlag: boolean,
): boolean {
  if (interruptedFlag) return true
  if (abortController.signal.aborted) return true
  if (!isRecord(error)) return false
  return error.name === 'AbortError'
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Expert model query timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    promise
      .then(value => resolve(value))
      .catch(err => reject(err))
      .finally(() => clearTimeout(timeoutId))
  })
}

function interruptResult(expertModelName: string): ToolYield {
  return {
    type: 'result',
    data: {
      chatSessionId: 'interrupted',
      expertModelName,
      expertAnswer: INTERRUPT_MESSAGE,
    },
    resultForAssistant: INTERRUPT_MESSAGE,
  }
}

export async function* callAskExpertModelTool(
  input: Input,
  context: Context,
  renderResultForAssistant: (output: Out) => string,
): AsyncGenerator<ToolYield> {
  const { question, expert_model, chat_session_id } = input
  const { abortController } = context

  const expertModel = expert_model
  let sessionId = ''
  let interrupted = false

  const abortListener = () => {
    interrupted = true
  }
  abortController.signal.addEventListener('abort', abortListener)

  try {
    if (abortController.signal.aborted) {
      yield interruptResult(expertModel)
      return
    }

    if (chat_session_id === 'new') {
      sessionId = createExpertChatSession(expertModel).sessionId
    } else {
      sessionId = chat_session_id
      const session = loadExpertChatSession(sessionId)
      if (!session) {
        sessionId = createExpertChatSession(expertModel).sessionId
      }
    }

    if (interrupted || abortController.signal.aborted) {
      yield interruptResult(expertModel)
      return
    }

    const history = (() => {
      try {
        return getSessionMessages(sessionId)
      } catch (error) {
        logError(error)
        return []
      }
    })()

    const conversation = [...history, { role: 'user', content: question }]
    const llmMessages = conversation.map(msg =>
      msg.role === 'user'
        ? createUserMessage(msg.content)
        : createAssistantMessage(msg.content),
    )

    if (interrupted || abortController.signal.aborted) {
      yield interruptResult(expertModel)
      return
    }

    yield {
      type: 'progress',
      content: createAssistantMessage(
        `Connecting to ${expertModel}... (timeout: 5 minutes)`,
      ),
    }

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

    const timeoutMs = 300_000
    const response = await withTimeout(
      queryLLM(llmMessages, [], 0, [], abortController.signal, {
        safeMode: false,
        model: expertModel,
        prependCLISysprompt: false,
      }),
      timeoutMs,
    )

    if (interrupted || abortController.signal.aborted) {
      yield interruptResult(expertModel)
      return
    }

    const expertAnswer = extractAssistantText(response).trim()
    if (!expertAnswer) {
      throw new Error('Expert response was empty')
    }

    try {
      addMessageToSession(sessionId, 'user', question)
      addMessageToSession(sessionId, 'assistant', expertAnswer)
    } catch (error) {
      logError(error)
    }

    const result: Out = {
      chatSessionId: sessionId,
      expertModelName: expertModel,
      expertAnswer,
    }

    yield {
      type: 'result',
      data: result,
      resultForAssistant: renderResultForAssistant(result),
    }
  } catch (error) {
    if (isInterrupted(error, abortController, interrupted)) {
      yield interruptResult(expertModel)
      return
    }

    logError(error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    const result: Out = {
      chatSessionId: sessionId || 'error-session',
      expertModelName: expertModel,
      expertAnswer: `❌ ${errorMessage || 'Expert consultation failed with unknown error'}`,
    }
    yield {
      type: 'result',
      data: result,
      resultForAssistant: renderResultForAssistant(result),
    }
  } finally {
    abortController.signal.removeEventListener('abort', abortListener)
  }
}
