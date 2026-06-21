/**
 * 🔥 GPT-5 Connection Test Service
 *
 * Specialized connection testing for GPT-5 models that supports both
 * Responses API and Chat Completions API with proper fallback handling.
 */
import { debug as debugLogger } from './debugLogger'

import type {
  ConnectionTestResult,
  GPT5TestConfig,
} from './connectionTest/types'
import { testResponsesAPI } from './connectionTest/responsesAPI'
import { testChatCompletionsAPI } from './connectionTest/chatCompletions'

export type {
  ConnectionTestResult,
  GPT5TestConfig,
} from './connectionTest/types'

type ConnectionTestModelFeatures = {
  supportsResponsesAPI: boolean
}

function getModelFeaturesForConnectionTest(
  modelName: string,
): ConnectionTestModelFeatures {
  const normalized = modelName.toLowerCase()

  // Some providers expose GPT-5 through Chat Completions only.
  if (normalized.includes('gpt-5-chat-latest')) {
    return { supportsResponsesAPI: false }
  }

  if (normalized.includes('gpt-5')) {
    return { supportsResponsesAPI: true }
  }

  return { supportsResponsesAPI: false }
}

/**
 * Test GPT-5 model connection with intelligent API selection
 */
export async function testGPT5Connection(
  config: GPT5TestConfig,
): Promise<ConnectionTestResult> {
  const startTime = Date.now()

  // Validate configuration
  if (!config.model || !config.apiKey) {
    return {
      success: false,
      message: 'Invalid configuration',
      details: 'Model name and API key are required',
    }
  }

  const isGPT5 = config.model.toLowerCase().includes('gpt-5')
  const modelFeatures = getModelFeaturesForConnectionTest(config.model)
  const baseURL = config.baseURL || 'https://api.openai.com/v1'
  const isOfficialOpenAI =
    !config.baseURL || config.baseURL.includes('api.openai.com')

  debugLogger.api('GPT5_CONNECTION_TEST_START', {
    model: config.model,
    baseURL,
    isOfficialOpenAI,
    supportsResponsesAPI: modelFeatures.supportsResponsesAPI,
  })

  // Try Responses API first for official GPT-5 models
  if (isGPT5 && modelFeatures.supportsResponsesAPI && isOfficialOpenAI) {
    debugLogger.api('GPT5_CONNECTION_TEST_TRY_RESPONSES', {
      model: config.model,
    })
    const responsesResult = await testResponsesAPI(config, baseURL, startTime)

    if (responsesResult.success) {
      debugLogger.api('GPT5_CONNECTION_TEST_RESPONSES_OK', {
        model: config.model,
      })
      return responsesResult
    }

    debugLogger.warn('GPT5_CONNECTION_TEST_RESPONSES_FAILED', {
      model: config.model,
      details: responsesResult.details,
    })
  }

  // Fallback to Chat Completions API
  debugLogger.api('GPT5_CONNECTION_TEST_FALLBACK_CHAT_COMPLETIONS', {
    model: config.model,
  })
  return await testChatCompletionsAPI(config, baseURL, startTime)
}

/**
 * Quick validation for GPT-5 configuration
 */
export function validateGPT5Config(config: GPT5TestConfig): {
  valid: boolean
  errors: string[]
} {
  debugLogger.state('GPT5_VALIDATE_CONFIG_CALLED', {
    model: config.model,
    hasApiKey: !!config.apiKey,
    baseURL: config.baseURL,
    provider: config.provider,
  })

  const errors: string[] = []

  if (!config.model) {
    errors.push('Model name is required')
  }

  if (!config.apiKey) {
    errors.push('API key is required')
  }

  const isGPT5 = config.model?.toLowerCase().includes('gpt-5')
  if (isGPT5) {
    debugLogger.state('GPT5_VALIDATE_CONFIG', {
      model: config.model,
      maxTokens: config.maxTokens,
    })

    if (config.maxTokens && config.maxTokens < 1000) {
      errors.push('GPT-5 models typically require at least 1000 max tokens')
    }

    // 完全移除第三方provider限制，允许所有代理中转站使用GPT-5
    debugLogger.state('GPT5_VALIDATE_CONFIG_NO_PROVIDER_RESTRICTIONS', {
      model: config.model,
    })
  }

  debugLogger.state('GPT5_VALIDATE_CONFIG_RESULT', {
    valid: errors.length === 0,
    errors,
  })

  return {
    valid: errors.length === 0,
    errors,
  }
}
