import { fetchCustomModels } from '#core/ai/openai'
import type { ModelInfo } from '../types'

type SetModelLoadError = (message: string) => void

export async function fetchKimiModels({
  apiKey,
  providerBaseUrl,
  setModelLoadError,
}: {
  apiKey: string
  providerBaseUrl: string
  setModelLoadError: SetModelLoadError
}): Promise<ModelInfo[]> {
  try {
    const baseURL = providerBaseUrl || 'https://api.moonshot.cn/v1'
    const models = await fetchCustomModels(baseURL, apiKey)

    return models.map((model: any) => ({
      model:
        model.modelName || model.id || model.name || model.model || 'unknown',
      provider: 'kimi',
      max_tokens: model.max_tokens || 8192,
      supports_vision: false, // Default to false, could be enhanced
      supports_function_calling: true,
      supports_reasoning_effort: false,
    }))
  } catch (error) {
    let errorMessage = 'Failed to fetch Kimi models'

    if (error instanceof Error) {
      errorMessage = error.message
    }

    // Add helpful suggestions based on error type
    if (errorMessage.includes('API key')) {
      errorMessage +=
        '\n\n💡 Tip: Get your API key from https://platform.moonshot.cn/console/api-keys'
    } else if (errorMessage.includes('permission')) {
      errorMessage +=
        '\n\n💡 Tip: Make sure your API key has access to the Kimi API'
    } else if (errorMessage.includes('connection')) {
      errorMessage += '\n\n💡 Tip: Check your internet connection and try again'
    }

    setModelLoadError(errorMessage)
    throw error
  }
}
