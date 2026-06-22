import Anthropic from '@anthropic-ai/sdk'
import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk'
import { AnthropicVertex } from '@anthropic-ai/vertex-sdk'
import type { BetaUsage } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import chalk from 'chalk'
import { createHash, randomUUID } from 'crypto'
import type { UUID } from 'crypto'
import 'dotenv/config'
import { addToTotalCost } from '#core/cost-tracker'
import models from '#core/constants/models'
import type { AssistantMessage, UserMessage } from '#core/query'
import {
  Tool,
  getToolDescription,
  resolveToolDescription,
} from '#core/tooling/Tool'
import { queryOpenAI } from '#core/ai/llm/openai'
import { queryAnthropicNative } from '#core/ai/llm/anthropic'
import {
  getAnthropicApiKey,
  getGlobalConfig,
  ModelProfile,
} from '#core/utils/config'
import { logError } from '#core/utils/log'
import { USER_AGENT } from '#core/utils/http'
import { countTokens } from '#core/utils/tokens'
import { setRequestStatus } from '#core/utils/requestStatus'
import { withVCR } from '#core/services/vcr'
import {
  debug as debugLogger,
  markPhase,
  getCurrentRequest,
  logLLMInteraction,
  logSystemPromptConstruction,
  logErrorWithDiagnosis,
} from '#core/utils/debugLogger'
import { getModelManager } from '#core/utils/model'
import { getAssistantMessageFromError } from '#core/ai/llm/errors'
import { withRetry } from '#core/ai/llm/retry'
import {
  PROMPT_CACHING_ENABLED,
  splitSysPromptPrefix,
} from '#core/ai/llm/systemPromptUtils'
import { getMaxTokensFromProfile } from '#core/ai/llm/maxTokens'
import { zodToJsonSchema } from 'zod-to-json-schema'
import type { BetaMessageStream } from '@anthropic-ai/sdk/lib/BetaMessageStream.mjs'
import {
  responseStateManager,
  getConversationId,
} from '#core/services/responseStateManager'
import type { ToolUseContext } from '#core/tooling/Tool'
import type {
  Message as APIMessage,
  MessageParam,
  TextBlockParam,
} from '@anthropic-ai/sdk/resources/index.mjs'
import { USE_BEDROCK, USE_VERTEX } from '#core/utils/model'
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
import { getVertexRegionForModel } from '#core/utils/model'
import { ContentBlock } from '@anthropic-ai/sdk/resources/messages/messages'
import { nanoid } from 'nanoid'
import { parseToolUsePartialJsonOrThrow } from '#core/utils/toolUsePartialJson'
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
// Helper function to extract model configuration for debug logging
function getModelConfigForDebug(model: string): {
  modelName: string
  provider: string
  apiKeyStatus: 'configured' | 'missing' | 'invalid'
  baseURL?: string
  maxTokens?: number
  reasoningEffort?: string
  isStream?: boolean
  temperature?: number
} {
  const config = getGlobalConfig()
  const modelManager = getModelManager()

  const modelProfile = modelManager.getModel('main')

  let apiKeyStatus: 'configured' | 'missing' | 'invalid' = 'missing'
  let baseURL: string | undefined
  let maxTokens: number | undefined
  let reasoningEffort: string | undefined

  if (modelProfile) {
    apiKeyStatus = modelProfile.apiKey ? 'configured' : 'missing'
    baseURL = modelProfile.baseURL
    maxTokens = modelProfile.maxTokens
    reasoningEffort = modelProfile.reasoningEffort
  } else {
    // 🚨 No ModelProfile available - this should not happen in modern system
    apiKeyStatus = 'missing'
    maxTokens = undefined
    reasoningEffort = undefined
  }

  return {
    modelName: model,
    provider: modelProfile?.provider || config.primaryProvider || 'anthropic',
    apiKeyStatus,
    baseURL,
    maxTokens,
    reasoningEffort,
    isStream: config.stream || false,
    temperature: MAIN_QUERY_TEMPERATURE,
  }
}
// KodeContext helpers are implemented in `./kodeContext` to keep this module lean.
export { generateKodeContext, refreshKodeContext }
export {
  getAnthropicClient,
  resetAnthropicClient,
  userMessageToMessageParam,
  assistantMessageToMessageParam,
} from '#core/ai/llm/anthropic'

interface StreamResponse extends APIMessage {
  ttftMs?: number
}

export {
  API_ERROR_MESSAGE_PREFIX,
  PROMPT_TOO_LONG_ERROR_MESSAGE,
  CREDIT_BALANCE_TOO_LOW_ERROR_MESSAGE,
  INVALID_API_KEY_ERROR_MESSAGE,
  NO_CONTENT_MESSAGE,
  MAIN_QUERY_TEMPERATURE,
}

// @see https://docs.anthropic.com/en/docs/about-claude/models#model-comparison-table
const HAIKU_COST_PER_MILLION_INPUT_TOKENS = 0.8
const HAIKU_COST_PER_MILLION_OUTPUT_TOKENS = 4
const HAIKU_COST_PER_MILLION_PROMPT_CACHE_WRITE_TOKENS = 1
const HAIKU_COST_PER_MILLION_PROMPT_CACHE_READ_TOKENS = 0.08

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
    __testModelManager?: any
    __testQueryLLMWithPromptCaching?: any
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
