import OpenAI from 'openai'

import models, { providers } from '#core/constants/models'
import type { ProviderType } from '#core/utils/config'
import { logError } from '#core/utils/log'

import type { ModelInfo } from '../types'

type Params = {
  selectedProvider: ProviderType
  apiKey: string
  providerBaseUrl: string
  customBaseUrl: string
  modelFetchers: any
  setIsLoadingModels: (isLoading: boolean) => void
  setModelLoadError: (error: string | null) => void
  setAvailableModels: (models: ModelInfo[]) => void
  navigateTo: (screen: 'model' | 'modelInput') => void
}

export async function fetchModelsForProvider({
  selectedProvider,
  apiKey,
  providerBaseUrl,
  customBaseUrl,
  modelFetchers,
  setIsLoadingModels,
  setModelLoadError,
  setAvailableModels,
  navigateTo,
}: Params): Promise<ModelInfo[]> {
  setIsLoadingModels(true)
  setModelLoadError(null)

  try {
    // For Anthropic provider (including official and community proxies via sub-menu), use the same logic
    if (selectedProvider === 'anthropic') {
      const anthropicModels =
        await modelFetchers.fetchAnthropicCompatibleProviderModels({
          apiKey,
          providerBaseUrl,
          setModelLoadError,
        })
      setAvailableModels(anthropicModels)
      navigateTo('model')
      return anthropicModels
    }

    // For custom OpenAI-compatible APIs, use the fetchCustomOpenAIModels function
    if (selectedProvider === 'custom-openai') {
      const customModels = await modelFetchers.fetchCustomOpenAIModels({
        apiKey,
        customBaseUrl,
        setModelLoadError,
      })
      setAvailableModels(customModels)
      navigateTo('model')
      return customModels
    }

    // For Gemini, use the separate fetchGeminiModels function
    if (selectedProvider === 'gemini') {
      const geminiModels = await modelFetchers.fetchGeminiModels({
        apiKey,
        setModelLoadError,
      })
      setAvailableModels(geminiModels)
      navigateTo('model')
      return geminiModels
    }

    // For Kimi, use the fetchKimiModels function
    if (selectedProvider === 'kimi') {
      const kimiModels = await modelFetchers.fetchKimiModels({
        apiKey,
        providerBaseUrl,
        setModelLoadError,
      })
      setAvailableModels(kimiModels)
      navigateTo('model')
      return kimiModels
    }

    // For DeepSeek, use the fetchDeepSeekModels function
    if (selectedProvider === 'deepseek') {
      const deepseekModels = await modelFetchers.fetchDeepSeekModels({
        apiKey,
        providerBaseUrl,
        setModelLoadError,
      })
      setAvailableModels(deepseekModels)
      navigateTo('model')
      return deepseekModels
    }

    // For SiliconFlow, use the fetchSiliconFlowModels function
    if (selectedProvider === 'siliconflow') {
      const siliconflowModels = await modelFetchers.fetchSiliconFlowModels({
        apiKey,
        providerBaseUrl,
        setModelLoadError,
      })
      setAvailableModels(siliconflowModels)
      navigateTo('model')
      return siliconflowModels
    }

    // For Qwen, use the fetchQwenModels function
    if (selectedProvider === 'qwen') {
      const qwenModels = await modelFetchers.fetchQwenModels({
        apiKey,
        providerBaseUrl,
        setModelLoadError,
      })
      setAvailableModels(qwenModels)
      navigateTo('model')
      return qwenModels
    }

    // For GLM, use the fetchGLMModels function
    if (selectedProvider === 'glm') {
      const glmModels = await modelFetchers.fetchGLMModels({
        apiKey,
        providerBaseUrl,
        setModelLoadError,
      })
      setAvailableModels(glmModels)
      navigateTo('model')
      return glmModels
    }

    // For Baidu Qianfan, use the fetchBaiduQianfanModels function
    if (selectedProvider === 'baidu-qianfan') {
      const baiduModels = await modelFetchers.fetchBaiduQianfanModels({
        apiKey,
        providerBaseUrl,
        setModelLoadError,
      })
      setAvailableModels(baiduModels)
      navigateTo('model')
      return baiduModels
    }

    // For Azure, skip model fetching and go directly to model input
    if (selectedProvider === 'azure') {
      navigateTo('modelInput')
      return []
    }

    // For all other providers, use the OpenAI client
    let baseURL = providerBaseUrl || providers[selectedProvider]?.baseURL

    // For custom-openai provider, use the custom base URL
    if (selectedProvider === 'custom-openai') {
      baseURL = customBaseUrl
    }

    const openai = new OpenAI({
      apiKey: apiKey || 'dummy-key-for-ollama', // Ollama doesn't need a real key
      baseURL: baseURL,
      dangerouslyAllowBrowser: true,
    })

    // Fetch the models
    const response = await openai.models.list()

    // Transform the response into our ModelInfo format
    const fetchedModels = []
    for (const model of response.data) {
      const record = model as unknown as Record<string, unknown>
      const modelName =
        (typeof record.modelName === 'string' && record.modelName) ||
        (typeof record.id === 'string' && record.id) ||
        (typeof record.name === 'string' && record.name) ||
        (typeof record.model === 'string' && record.model) ||
        'unknown'
      const modelInfo = models[selectedProvider as keyof typeof models]?.find(
        m => m.model === modelName,
      )
      fetchedModels.push({
        model: modelName,
        provider: selectedProvider,
        max_tokens: modelInfo?.max_output_tokens,
        supports_vision: modelInfo?.supports_vision || false,
        supports_function_calling:
          modelInfo?.supports_function_calling || false,
        supports_reasoning_effort:
          modelInfo?.supports_reasoning_effort || false,
      })
    }

    setAvailableModels(fetchedModels)

    // Navigate to model selection screen if models were loaded successfully
    navigateTo('model')

    return fetchedModels
  } catch (error) {
    logError(error)

    // Re-throw the error so that fetchModelsWithRetry can handle it properly
    throw error
  } finally {
    setIsLoadingModels(false)
  }
}
