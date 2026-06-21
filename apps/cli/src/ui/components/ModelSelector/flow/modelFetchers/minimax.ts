import { fetchCustomModels } from '#core/ai/openai'
import type { ModelInfo } from '../types'

type SetModelLoadError = (message: string) => void

export async function fetchMinimaxModels({
  apiKey,
  providerBaseUrl,
  setModelLoadError,
}: {
  apiKey: string
  providerBaseUrl: string
  setModelLoadError: SetModelLoadError
}): Promise<ModelInfo[]> {
  try {
    const baseURL = providerBaseUrl || 'https://api.minimaxi.com/v1'
    const models = await fetchCustomModels(baseURL, apiKey)

    return models.map((model: any) => ({
      model:
        model.modelName || model.id || model.name || model.model || 'unknown',
      provider: 'minimax',
      max_tokens: model.max_tokens || 8192,
      supports_vision: false,
      supports_function_calling: true,
      supports_reasoning_effort: false,
    }))
  } catch (error) {
    let errorMessage = 'Failed to fetch MiniMax models'

    if (error instanceof Error) {
      errorMessage = error.message
    }

    if (errorMessage.includes('API key')) {
      errorMessage +=
        '\n\n💡 Tip: Get your API key from https://www.minimax.io/platform/user-center/basic-information'
    } else if (errorMessage.includes('permission')) {
      errorMessage +=
        '\n\n💡 Tip: Make sure your API key has access to the MiniMax API'
    } else if (errorMessage.includes('connection')) {
      errorMessage += '\n\n💡 Tip: Check your internet connection and try again'
    }

    setModelLoadError(errorMessage)
    throw error
  }
}
