import { randomUUID } from 'crypto'
import type { UUID } from 'crypto'
import 'dotenv/config'
import type { AssistantMessage, UserMessage } from '#core/query'
import { resolveToolDescription, type Tool } from '#core/tooling/Tool'
import { queryOpenAI } from '@kode/ai/llm/openai'
import { queryAnthropicNative } from '#core/ai/llm/anthropic'
import { getGlobalConfig, type ModelProfile } from '#core/utils/config'
import { withVCR } from '#core/services/vcr'
import {
  debug as debugLogger,
  markPhase,
  getCurrentRequest,
  logErrorWithDiagnosis,
} from '#core/utils/debugLogger'
import {
  getModelManager,
  type ModelParam,
  type ResolvedModelInfo,
} from '#core/utils/model'
import {
  responseStateManager,
  getConversationId,
} from '#core/services/responseStateManager'
import type { ToolUseContext } from '#core/tooling/Tool'
import {
  getCLISyspromptPrefix,
  getCompatSyspromptPrefix,
  getCompatSystemPrompt,
} from '#core/constants/prompts'
import {
  buildRequestStrategyFallbackPlan,
  filterToolsForCompatProfile,
  shouldAttemptRestrictedClientFallback,
} from '#core/ai/llm/restrictedClientCompat'
import { generateKodeContext, refreshKodeContext } from './llm/kodeContext'
import {
  API_ERROR_MESSAGE_PREFIX,
  CREDIT_BALANCE_TOO_LOW_ERROR_MESSAGE,
  INVALID_API_KEY_ERROR_MESSAGE,
  MAIN_QUERY_TEMPERATURE,
  NO_CONTENT_MESSAGE,
  PROMPT_TOO_LONG_ERROR_MESSAGE,
} from './constants'
export { fetchAnthropicModels, verifyApiKey } from './llm/apiKey'

// KodeContext helpers are implemented in `./kodeContext` to keep this module lean.
export { generateKodeContext, refreshKodeContext }
export {
  getAnthropicClient,
  resetAnthropicClient,
  userMessageToMessageParam,
  assistantMessageToMessageParam,
} from '#core/ai/llm/anthropic'

type QueryLLMTestModelManager = {
  resolveModelWithInfo(modelParam: ModelParam): ResolvedModelInfo
  resolveModel(modelParam: ModelParam): ModelProfile | null
}

type QueryLLMWithPromptCachingFn = typeof queryLLMWithPromptCaching

export {
  API_ERROR_MESSAGE_PREFIX,
  PROMPT_TOO_LONG_ERROR_MESSAGE,
  CREDIT_BALANCE_TOO_LOW_ERROR_MESSAGE,
  INVALID_API_KEY_ERROR_MESSAGE,
  NO_CONTENT_MESSAGE,
  MAIN_QUERY_TEMPERATURE,
}

export async function queryLLM(
  messages: (UserMessage | AssistantMessage)[],
  systemPrompt: string[],
  maxThinkingTokens: number,
  tools: Tool[],
  signal: AbortSignal,
  options: {
    safeMode: boolean
    model: string | import('#core/utils/config').ModelPointerType
    prependCLISysprompt: boolean
    temperature?: number
    /**
     * Optional per-call max tokens override (used for small deterministic sub-queries like safety gates).
     */
    maxTokens?: number
    /**
     * Optional per-call stop sequences (best-effort; ignored by providers that don't support it).
     */
    stopSequences?: string[]
    toolUseContext?: ToolUseContext
    __testModelManager?: QueryLLMTestModelManager
    __testQueryLLMWithPromptCaching?: QueryLLMWithPromptCachingFn
  },
): Promise<AssistantMessage> {
  const modelManager = options.__testModelManager ?? getModelManager()
  const modelResolution = modelManager.resolveModelWithInfo(options.model)

  if (!modelResolution.success || !modelResolution.profile) {
    const fallbackProfile = modelManager.resolveModel(options.model)
    if (!fallbackProfile) {
      throw new Error(
        modelResolution.error || `Failed to resolve model: ${options.model}`,
      )
    }

    debugLogger.warn('MODEL_RESOLUTION_FALLBACK', {
      inputParam: options.model,
      error: modelResolution.error,
      fallbackModelName: fallbackProfile.modelName,
      fallbackProvider: fallbackProfile.provider,
      requestId: getCurrentRequest()?.id,
    })

    modelResolution.success = true
    modelResolution.profile = fallbackProfile
  }

  const modelProfile = modelResolution.profile
  const resolvedModel = modelProfile.modelName

  // Initialize response state if toolUseContext is provided
  const toolUseContext = options.toolUseContext
  if (toolUseContext && !toolUseContext.responseState) {
    const conversationId = getConversationId(
      toolUseContext.agentId,
      toolUseContext.messageId,
    )
    const previousResponseId =
      responseStateManager.getPreviousResponseId(conversationId)

    toolUseContext.responseState = {
      previousResponseId,
      conversationId,
    }
  }

  // Resolve and cache tool descriptions before building any provider tool schemas.
  // Some adapters build JSON schemas synchronously and rely on `cachedDescription`.
  await Promise.all(tools.map(tool => resolveToolDescription(tool)))

  debugLogger.api('MODEL_RESOLVED', {
    inputParam: options.model,
    resolvedModelName: resolvedModel,
    provider: modelProfile.provider,
    isPointer: ['main', 'task', 'compact', 'quick'].includes(options.model),
    hasResponseState: !!toolUseContext?.responseState,
    conversationId: toolUseContext?.responseState?.conversationId,
    requestId: getCurrentRequest()?.id,
  })

  const currentRequest = getCurrentRequest()
  debugLogger.api('LLM_REQUEST_START', {
    messageCount: messages.length,
    systemPromptLength: systemPrompt.join(' ').length,
    toolCount: tools.length,
    model: resolvedModel,
    originalModelParam: options.model,
    requestId: getCurrentRequest()?.id,
  })

  markPhase('LLM_CALL')

  try {
    const queryFn =
      options.__testQueryLLMWithPromptCaching ?? queryLLMWithPromptCaching
    const cleanOptions: any = { ...options }
    delete cleanOptions.__testModelManager
    delete cleanOptions.__testQueryLLMWithPromptCaching

    const runQuery = () =>
      queryFn(
        messages,
        systemPrompt,
        maxThinkingTokens,
        tools,
        signal,
        {
          ...cleanOptions,
          model: resolvedModel,
          modelProfile,
          toolUseContext,
        }, // Pass resolved ModelProfile and toolUseContext
      )

    const result = options.__testQueryLLMWithPromptCaching
      ? await runQuery()
      : await withVCR(messages, runQuery)

    debugLogger.api('LLM_REQUEST_SUCCESS', {
      costUSD: result.costUSD,
      durationMs: result.durationMs,
      responseLength: result.message.content?.length || 0,
      requestId: getCurrentRequest()?.id,
    })

    // Update response state for GPT-5 Responses API continuation
    if (toolUseContext?.responseState?.conversationId && result.responseId) {
      responseStateManager.setPreviousResponseId(
        toolUseContext.responseState.conversationId,
        result.responseId,
      )

      debugLogger.api('RESPONSE_STATE_UPDATED', {
        conversationId: toolUseContext.responseState.conversationId,
        responseId: result.responseId,
        requestId: getCurrentRequest()?.id,
      })
    }

    return result
  } catch (error) {
    // 使用错误诊断系统记录 LLM 相关错误
    logErrorWithDiagnosis(
      error,
      {
        messageCount: messages.length,
        systemPromptLength: systemPrompt.join(' ').length,
        model: options.model,
        toolCount: tools.length,
        phase: 'LLM_CALL',
      },
      currentRequest?.id,
    )

    throw error
  }
}

export { formatSystemPromptWithContext } from '#core/services/systemPrompt'

async function queryLLMWithPromptCaching(
  messages: (UserMessage | AssistantMessage)[],
  systemPrompt: string[],
  maxThinkingTokens: number,
  tools: Tool[],
  signal: AbortSignal,
  options: {
    safeMode: boolean
    model: string
    prependCLISysprompt: boolean
    temperature?: number
    maxTokens?: number
    stopSequences?: string[]
    modelProfile?: ModelProfile | null
    toolUseContext?: ToolUseContext
  },
): Promise<AssistantMessage> {
  const config = getGlobalConfig()
  const modelManager = getModelManager()
  const toolUseContext = options.toolUseContext

  const modelProfile = options.modelProfile || modelManager.getModel('main')
  let provider: string

  if (modelProfile) {
    provider = modelProfile.provider || config.primaryProvider || 'anthropic'
  } else {
    provider = config.primaryProvider || 'anthropic'
  }

  const fallbackPlan = buildRequestStrategyFallbackPlan(
    modelProfile?.requestStrategy,
    options.model,
  )
  const compatibilityToolUseContext =
    toolUseContext && toolUseContext.options
      ? {
          ...toolUseContext,
          options: {
            ...toolUseContext.options,
            getCustomSystemPromptAdditions: undefined,
          },
        }
      : toolUseContext

  let lastError: unknown = null

  for (const step of fallbackPlan) {
    const effectiveTools =
      step.tools === 'compat' ? filterToolsForCompatProfile(tools) : tools
    const effectiveSystemPrompt =
      step.systemPrompt === 'compat'
        ? await getCompatSystemPrompt({
            model: options.model,
            toolNames: effectiveTools.map(t => t.name),
            toolUseContext: compatibilityToolUseContext,
            outputStyleActive: false,
          })
        : systemPrompt
    const cliSyspromptPrefix =
      step.systemPrompt === 'compat'
        ? getCompatSyspromptPrefix()
        : getCLISyspromptPrefix()

    try {
      // Use native Anthropic SDK for Anthropic and some Anthropic-compatible providers
      if (
        provider === 'anthropic' ||
        provider === 'bigdream' ||
        provider === 'opendev' ||
        provider === 'minimax-coding'
      ) {
        return await queryAnthropicNative(
          messages,
          effectiveSystemPrompt,
          maxThinkingTokens,
          effectiveTools,
          signal,
          {
            ...options,
            modelProfile,
            toolUseContext,
            requestHeadersProfile: step.headers,
            cliSyspromptPrefix,
          },
        )
      }

      // Use OpenAI-compatible interface for all other providers
      return await queryOpenAI(
        messages,
        effectiveSystemPrompt,
        maxThinkingTokens,
        effectiveTools,
        signal,
        {
          ...options,
          modelProfile,
          toolUseContext,
          requestHeadersProfile: step.headers,
          cliSyspromptPrefix,
        },
      )
    } catch (error) {
      lastError = error
      if (!shouldAttemptRestrictedClientFallback(error, options.model)) {
        throw error
      }
    }
  }

  if (lastError) throw lastError
  throw new Error('Failed to query model')
}

export async function queryModel(
  modelPointer: import('#core/utils/config').ModelPointerType,
  messages: (UserMessage | AssistantMessage)[],
  systemPrompt: string[] = [],
  signal?: AbortSignal,
): Promise<AssistantMessage> {
  // Use queryLLM with the pointer directly
  return queryLLM(
    messages,
    systemPrompt,
    0, // maxThinkingTokens
    [], // tools
    signal || new AbortController().signal,
    {
      safeMode: false,
      model: modelPointer,
      prependCLISysprompt: true,
    },
  )
}

// Note: Use queryModel(pointer, ...) directly instead of these convenience functions

// Simplified query function using quick model pointer
export async function queryQuick({
  systemPrompt = [],
  userPrompt,
  assistantPrompt,
  enablePromptCaching = false,
  signal,
}: {
  systemPrompt?: string[]
  userPrompt: string
  assistantPrompt?: string
  enablePromptCaching?: boolean
  signal?: AbortSignal
}): Promise<AssistantMessage> {
  const messages = [
    {
      message: { role: 'user', content: userPrompt },
      type: 'user',
      uuid: randomUUID(),
    },
  ] as (UserMessage | AssistantMessage)[]

  return queryModel('quick', messages, systemPrompt, signal)
}
