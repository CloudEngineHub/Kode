import { debug as debugLogger } from '#core/utils/debugLogger'
import { fetchModelsForProvider } from './flow/actions/fetchModels'
import {
  DEFAULT_CONTEXT_LENGTH,
  DEFAULT_MAX_TOKENS,
  MAX_TOKENS_OPTIONS,
  REASONING_EFFORT_OPTIONS,
  REQUEST_STRATEGY_OPTIONS,
} from './flow/options'
import type { ModelInfo } from './flow/types'
import * as modelFetchers from './flow/modelFetchers'
import { logError } from '#core/utils/log'
import { fetchOllamaModels } from './fetchOllamaModels'
import type { ModelSelectorState } from './useModelSelectorState'
import type { ModelParamsField } from './viewTypes'

export function useModelSelectorModelFlow(state: ModelSelectorState) {
  function summarizeErrorMessage(message: string): string {
    const normalized = message.replace(/\s+/g, ' ').trim()
    const htmlIndex = normalized.toLowerCase().indexOf('<html')
    const trimmed =
      htmlIndex >= 0 ? normalized.slice(0, htmlIndex).trim() : normalized
    if (!trimmed) return 'Unknown error'
    return trimmed.length > 240 ? `${trimmed.slice(0, 240)}…` : trimmed
  }

  async function fetchModels(): Promise<ModelInfo[]> {
    return await fetchModelsForProvider({
      selectedProvider: state.selectedProvider,
      apiKey: state.apiKey,
      providerBaseUrl: state.providerBaseUrl,
      customBaseUrl: state.customBaseUrl,
      modelFetchers,
      setIsLoadingModels: state.setIsLoadingModels,
      setModelLoadError: state.setModelLoadError,
      setAvailableModels: state.setAvailableModels,
      navigateTo: state.navigateTo,
    })
  }

  async function fetchModelsWithRetry(): Promise<ModelInfo[]> {
    const MAX_RETRIES = 2
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      state.setFetchRetryCount(attempt)
      state.setIsRetrying(attempt > 1)

      if (attempt > 1) {
        state.setModelLoadError(
          `Attempt ${attempt}/${MAX_RETRIES}: Retrying model discovery...`,
        )
        await new Promise(resolve => setTimeout(resolve, 1000))
      }

      try {
        const models = await fetchModels()
        state.setFetchRetryCount(0)
        state.setIsRetrying(false)
        state.setModelLoadError(null)
        return models
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        debugLogger.warn('MODEL_FETCH_RETRY_FAILED', {
          attempt,
          maxRetries: MAX_RETRIES,
          error: lastError.message,
          provider: state.selectedProvider,
        })

        if (attempt === MAX_RETRIES) break
      }
    }

    state.setIsRetrying(false)
    const errorMessage = summarizeErrorMessage(lastError?.message || '')

    state.setModelLoadError(
      `Failed to validate API key after ${MAX_RETRIES} attempts: ${errorMessage}`,
    )
    throw new Error(`API key validation failed: ${errorMessage}`)
  }

  async function handleApiKeySubmit(key: string) {
    const cleanedKey = key.replace(/\s+/g, '').trim()
    state.setApiKey(cleanedKey)
    state.setModelLoadError(null)

    if (state.selectedProvider === 'azure') {
      state.navigateTo('resourceName')
      return
    }

    if (
      state.selectedProvider === 'minimax' ||
      state.selectedProvider === 'minimax-coding'
    ) {
      state.navigateTo('modelInput')
      return
    }

    try {
      state.setIsLoadingModels(true)
      const models = await fetchModelsWithRetry()
      if (models.length === 0) {
        state.navigateTo('modelInput')
      }
    } catch (error) {
      logError(error)
    } finally {
      state.setIsLoadingModels(false)
    }
  }

  function handleResourceNameSubmit(name: string) {
    state.setResourceName(name)
    state.navigateTo('modelInput')
  }

  function handleCustomBaseUrlSubmit(url: string) {
    const cleanUrl = url.replace(/\/+$/, '')
    state.setCustomBaseUrl(cleanUrl)
    state.navigateTo('apiKey')
  }

  function handleProviderBaseUrlSubmit(url: string) {
    const cleanUrl = url.replace(/\/+$/, '')
    state.setProviderBaseUrl(cleanUrl)

    if (state.selectedProvider === 'ollama') {
      state.setOllamaBaseUrl(cleanUrl)
      state.setIsLoadingModels(true)
      state.setModelLoadError(null)

      fetchOllamaModels({
        ollamaBaseUrl: cleanUrl,
        setAvailableModels: state.setAvailableModels,
        setModelLoadError: state.setModelLoadError,
        navigateTo: () => state.navigateTo('model'),
      }).finally(() => {
        state.setIsLoadingModels(false)
      })
    } else {
      state.navigateTo('apiKey')
    }
  }

  function handleCustomModelSubmit(model: string) {
    state.setCustomModelName(model)
    state.setSelectedModel(model)
    state.setSupportsReasoningEffort(false)
    state.setReasoningEffort(null)

    state.setMaxTokensMode('preset')
    state.setSelectedMaxTokensPreset(DEFAULT_MAX_TOKENS)
    state.setMaxTokens(DEFAULT_MAX_TOKENS.toString())
    state.setMaxTokensCursorOffset(DEFAULT_MAX_TOKENS.toString().length)

    state.navigateTo('modelParams')
    state.setActiveFieldIndex(0)
  }

  function handleModelSelection(model: string) {
    state.setSelectedModel(model)

    const modelInfo = state.availableModels.find(m => m.model === model)
    state.setSupportsReasoningEffort(
      Boolean(modelInfo?.supports_reasoning_effort),
    )

    if (!modelInfo?.supports_reasoning_effort) {
      state.setReasoningEffort(null)
    }

    state.setContextLength(modelInfo?.context_length ?? DEFAULT_CONTEXT_LENGTH)

    const modelMaxTokens = modelInfo?.max_tokens
    if (typeof modelMaxTokens === 'number' && Number.isFinite(modelMaxTokens)) {
      const matchingPreset = MAX_TOKENS_OPTIONS.find(
        option => option.value === modelMaxTokens,
      )

      if (matchingPreset) {
        state.setMaxTokensMode('preset')
        state.setSelectedMaxTokensPreset(modelMaxTokens)
        state.setMaxTokens(modelMaxTokens.toString())
      } else {
        state.setMaxTokensMode('custom')
        state.setMaxTokens(modelMaxTokens.toString())
      }
      state.setMaxTokensCursorOffset(modelMaxTokens.toString().length)
    } else {
      state.setMaxTokensMode('preset')
      state.setSelectedMaxTokensPreset(DEFAULT_MAX_TOKENS)
      state.setMaxTokens(DEFAULT_MAX_TOKENS.toString())
      state.setMaxTokensCursorOffset(DEFAULT_MAX_TOKENS.toString().length)
    }

    state.navigateTo('modelParams')
    state.setActiveFieldIndex(0)
  }

  const handleModelParamsSubmit = () => {
    state.navigateTo('contextLength')
  }

  const getFormFieldsForModelParams = (): ModelParamsField[] => {
    const fields: ModelParamsField[] = [
      {
        name: 'maxTokens',
        label: 'Maximum Tokens',
        description: 'Select the maximum number of tokens to generate.',
        component: 'select',
        options: MAX_TOKENS_OPTIONS.map(option => ({
          label: option.label,
          value: option.value.toString(),
        })),
        defaultValue: state.maxTokens,
      },
    ]

    if (state.supportsReasoningEffort) {
      fields.push({
        name: 'reasoningEffort',
        label: 'Reasoning Effort',
        description: 'Controls reasoning depth for complex problems.',
        component: 'select',
      })
    }

    if (state.selectedModel.toLowerCase().includes('claude')) {
      fields.push({
        name: 'requestStrategy',
        label: 'Request Strategy',
        description:
          'Choose how Kode should try compatibility request profiles if a provider blocks third-party clients.',
        component: 'select',
        options: REQUEST_STRATEGY_OPTIONS.map(option => ({
          label: option.label,
          value: option.value,
        })),
        defaultValue: state.requestStrategy,
      })
    }

    fields.push({ name: 'submit', label: 'Continue →', component: 'button' })
    return fields
  }

  const reasoningEffortOptions = REASONING_EFFORT_OPTIONS
  const requestStrategyOptions = REQUEST_STRATEGY_OPTIONS
  const handleContextLengthSubmit = () =>
    state.navigateTo(state.isEditing ? 'confirmation' : 'connectionTest')

  return {
    fetchModelsWithRetry,
    handleApiKeySubmit,
    handleResourceNameSubmit,
    handleCustomBaseUrlSubmit,
    handleProviderBaseUrlSubmit,
    handleCustomModelSubmit,
    handleModelSelection,
    handleModelParamsSubmit,
    getFormFieldsForModelParams,
    reasoningEffortOptions,
    requestStrategyOptions,
    handleContextLengthSubmit,
  }
}

export type ModelSelectorModelFlow = ReturnType<
  typeof useModelSelectorModelFlow
>
