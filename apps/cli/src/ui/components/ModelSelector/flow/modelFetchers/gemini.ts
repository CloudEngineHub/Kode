import type { ModelInfo } from '../types'

type SetModelLoadError = (message: string) => void

export async function fetchGeminiModels({
  apiKey,
  setModelLoadError,
}: {
  apiKey: string
  setModelLoadError: SetModelLoadError
}): Promise<ModelInfo[]> {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    )

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(
        errorData.error?.message || `API error: ${response.status}`,
      )
    }

    const { models } = await response.json()

    return models
      .filter((model: any) =>
        model.supportedGenerationMethods.includes('generateContent'),
      )
      .map((model: any) => ({
        model: model.name.replace('models/', ''),
        provider: 'gemini',
        max_tokens: model.outputTokenLimit,
        supports_vision:
          model.supportedGenerationMethods.includes('generateContent'),
        supports_function_calling:
          model.supportedGenerationMethods.includes('generateContent'),
      }))
  } catch (error) {
    setModelLoadError(error instanceof Error ? error.message : 'Unknown error')
    throw error
  }
}
