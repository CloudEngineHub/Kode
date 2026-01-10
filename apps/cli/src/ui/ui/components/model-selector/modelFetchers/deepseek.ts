import { fetchCustomModels } from '#core/ai/openai'
import type { ModelInfo } from '../types'

type SetModelLoadError = (message: string) => void

export async function fetchDeepSeekModels({
  apiKey,
  providerBaseUrl,
  setModelLoadError,
}: {
  apiKey: string
  providerBaseUrl: string
  setModelLoadError: SetModelLoadError
}): Promise<ModelInfo[]> {
  try {
    const baseURL = providerBaseUrl || 'https://api.deepseek.com'
    const models = await fetchCustomModels(baseURL, apiKey)

    return models.map((model: any) => ({
      model:
        model.modelName || model.id || model.name || model.model || 'unknown',
      provider: 'deepseek',
      max_tokens: model.max_tokens || 8192,
      supports_vision: false, // Default to false, could be enhanced
      supports_function_calling: true,
      supports_reasoning_effort: false,
    }))
  } catch (error) {
    let errorMessage = 'Failed to fetch DeepSeek models'

    if (error instanceof Error) {
      errorMessage = error.message
    }

    // Add helpful suggestions based on error type
    if (errorMessage.includes('API key')) {
      errorMessage +=
        '\n\n💡 Tip: Get your API key from https://platform.deepseek.com/api_keys'
    } else if (errorMessage.includes('permission')) {
      errorMessage +=
        '\n\n💡 Tip: Make sure your API key has access to the DeepSeek API'
    } else if (errorMessage.includes('connection')) {
      errorMessage += '\n\n💡 Tip: Check your internet connection and try again'
    }

    setModelLoadError(errorMessage)
    throw error
  }
}
