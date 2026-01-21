import { fetchCustomModels } from '#core/ai/openai'
import { debug as debugLogger } from '#core/utils/debugLogger'
import type { ModelInfo } from '../types'

type SetModelLoadError = (message: string) => void

async function fetchAnthropicModels(baseURL: string, apiKey: string) {
  try {
    const response = await fetch(`${baseURL}/v1/models`, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
    })

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error(
          'Invalid API key. Please check your API key and try again.',
        )
      } else if (response.status === 403) {
        throw new Error('API key does not have permission to access models.')
      } else if (response.status === 404) {
        throw new Error(
          'API endpoint not found. This provider may not support model listing.',
        )
      } else if (response.status === 429) {
        throw new Error(
          'Too many requests. Please wait a moment and try again.',
        )
      } else if (response.status >= 500) {
        throw new Error(
          'API service is temporarily unavailable. Please try again later.',
        )
      } else {
        throw new Error(`Unable to connect to API (${response.status}).`)
      }
    }

    const data = await response.json()

    let models = []
    if (data && data.data && Array.isArray(data.data)) {
      models = data.data
    } else if (Array.isArray(data)) {
      models = data
    } else if (data && data.models && Array.isArray(data.models)) {
      models = data.models
    } else {
      throw new Error('API returned unexpected response format.')
    }

    return models
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('API key') ||
        error.message.includes('API endpoint') ||
        error.message.includes('API service') ||
        error.message.includes('response format'))
    ) {
      throw error
    }

    if (error instanceof Error && error.message.includes('fetch')) {
      throw new Error(
        'Unable to connect to the API. Please check the base URL and your internet connection.',
      )
    }

    throw new Error(
      'Failed to fetch models from API. Please check your configuration and try again.',
    )
  }
}

// 通用的Anthropic兼容模型获取函数，实现三层降级策略
async function fetchAnthropicCompatibleModelsWithFallback({
  baseURL,
  provider,
  apiKey,
  apiKeyUrl,
  setModelLoadError,
}: {
  baseURL: string
  provider: string
  apiKey: string
  apiKeyUrl: string
  setModelLoadError: SetModelLoadError
}): Promise<ModelInfo[]> {
  let lastError: Error | null = null

  // 第一层：尝试使用 Anthropic 风格的 API
  try {
    const models = await fetchAnthropicModels(baseURL, apiKey)
    return models.map((model: any) => ({
      model:
        model.modelName || model.id || model.name || model.model || 'unknown',
      provider: provider,
      max_tokens: model.max_tokens || 8192,
      supports_vision: model.supports_vision || true,
      supports_function_calling: model.supports_function_calling || true,
      supports_reasoning_effort: false,
    }))
  } catch (error) {
    lastError = error as Error
    debugLogger.warn('MODEL_FETCH_NATIVE_API_FAILED', {
      provider,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  // 第二层：尝试使用 OpenAI 风格的 API
  try {
    const models = await fetchCustomModels(baseURL, apiKey)
    return models.map((model: any) => ({
      model:
        model.modelName || model.id || model.name || model.model || 'unknown',
      provider: provider,
      max_tokens: model.max_tokens || 8192,
      supports_vision: model.supports_vision || false,
      supports_function_calling: model.supports_function_calling || true,
      supports_reasoning_effort: false,
    }))
  } catch (error) {
    lastError = error as Error
    debugLogger.warn('MODEL_FETCH_OPENAI_API_FAILED', {
      provider,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  // 第三层：降级到手动输入模式
  let errorMessage = `Failed to fetch ${provider} models using both native and OpenAI-compatible API formats`
  if (lastError instanceof Error) {
    errorMessage = lastError.message
  }

  // 添加有用的建议
  if (errorMessage.includes('API key')) {
    errorMessage += apiKeyUrl
      ? `\n\n💡 Tip: Get your API key from ${apiKeyUrl}`
      : '\n\n💡 Tip: Check that your API key is set and valid for this provider'
  } else if (errorMessage.includes('permission')) {
    errorMessage += `\n\n💡 Tip: Make sure your API key has access to the ${provider} API`
  } else if (errorMessage.includes('connection')) {
    errorMessage += '\n\n💡 Tip: Check your internet connection and try again'
  }

  setModelLoadError(errorMessage)
  throw new Error(errorMessage)
}

export async function fetchAnthropicCompatibleProviderModels({
  apiKey,
  providerBaseUrl,
  setModelLoadError,
}: {
  apiKey: string
  providerBaseUrl: string
  setModelLoadError: SetModelLoadError
}): Promise<ModelInfo[]> {
  // For anthropic, use defaults
  const defaultBaseURL = 'https://api.anthropic.com'
  const apiKeyUrl = ''
  const actualProvider = 'anthropic'
  const baseURL = providerBaseUrl || defaultBaseURL
  return fetchAnthropicCompatibleModelsWithFallback({
    baseURL,
    provider: actualProvider,
    apiKey,
    apiKeyUrl,
    setModelLoadError,
  })
}
