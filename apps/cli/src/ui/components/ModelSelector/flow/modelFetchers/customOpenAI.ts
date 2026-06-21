import { fetchCustomModels } from '#core/ai/openai'
import type { ModelInfo } from '../types'

type SetModelLoadError = (message: string) => void

export async function fetchCustomOpenAIModels({
  apiKey,
  customBaseUrl,
  setModelLoadError,
}: {
  apiKey: string
  customBaseUrl: string
  setModelLoadError: SetModelLoadError
}): Promise<ModelInfo[]> {
  try {
    const models = await fetchCustomModels(customBaseUrl, apiKey)

    return models.map((model: any) => ({
      model:
        model.modelName || model.id || model.name || model.model || 'unknown',
      provider: 'custom-openai',
      max_tokens: model.max_tokens || 4096,
      supports_vision: false, // Default to false, could be enhanced
      supports_function_calling: true,
      supports_reasoning_effort: false,
    }))
  } catch (error) {
    let errorMessage = 'Failed to fetch custom API models'

    if (error instanceof Error) {
      errorMessage = error.message
    }

    // Add helpful suggestions based on error type
    if (errorMessage.includes('API key')) {
      errorMessage +=
        '\n\n💡 Tip: Check that your API key is valid for this endpoint'
    } else if (errorMessage.includes('endpoint not found')) {
      errorMessage +=
        '\n\n💡 Tip: Make sure the base URL ends with /v1 and supports OpenAI-compatible API'
    } else if (errorMessage.includes('connect')) {
      errorMessage +=
        '\n\n💡 Tip: Verify the base URL is correct and accessible'
    } else if (errorMessage.includes('response format')) {
      errorMessage += '\n\n💡 Tip: This API may not be fully OpenAI-compatible'
    }

    setModelLoadError(errorMessage)
    throw error
  }
}
