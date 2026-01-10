import { useState } from 'react'
import { getGlobalConfig, type ProviderType } from '#core/utils/config'
import type { ConnectionTestResult } from '#ui-ink/ui/components/model-selector/actions/connectionTest'
import {
  DEFAULT_CONTEXT_LENGTH,
  DEFAULT_MAX_TOKENS,
  type ReasoningEffortOption,
  type RequestStrategyOption,
} from '#ui-ink/ui/components/model-selector/options'
import {
  createInitialScreenStack,
  getCurrentScreen,
  pushScreen,
  type ModelSelectorScreen,
} from '#ui-ink/ui/components/model-selector/state'
import type { ModelInfo } from '#ui-ink/ui/components/model-selector/types'

export function useModelSelectorState(opts: { skipModelType: boolean }) {
  const config = getGlobalConfig()

  const [screenStack, setScreenStack] = useState<ModelSelectorScreen[]>(() =>
    createInitialScreenStack({ skipModelType: opts.skipModelType }),
  )

  const currentScreen = getCurrentScreen(screenStack)
  const navigateTo = (screen: ModelSelectorScreen) => {
    setScreenStack(prev => pushScreen(prev, screen))
  }

  const [selectedProvider, setSelectedProvider] = useState<ProviderType>(
    config.primaryProvider ?? 'anthropic',
  )
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [apiKey, setApiKey] = useState<string>('')

  const [maxTokens, setMaxTokens] = useState<string>(
    config.maxTokens?.toString() || DEFAULT_MAX_TOKENS.toString(),
  )
  const [maxTokensMode, setMaxTokensMode] = useState<'preset' | 'custom'>(
    'preset',
  )
  const [selectedMaxTokensPreset, setSelectedMaxTokensPreset] =
    useState<number>(config.maxTokens || DEFAULT_MAX_TOKENS)
  const [reasoningEffort, setReasoningEffort] =
    useState<ReasoningEffortOption | null>('medium')
  const [supportsReasoningEffort, setSupportsReasoningEffort] =
    useState<boolean>(false)

  const [contextLength, setContextLength] = useState<number>(
    DEFAULT_CONTEXT_LENGTH,
  )

  const [requestStrategy, setRequestStrategy] =
    useState<RequestStrategyOption>('auto')

  const [activeFieldIndex, setActiveFieldIndex] = useState(0)
  const [maxTokensCursorOffset, setMaxTokensCursorOffset] = useState<number>(0)

  const [apiKeyCleanedNotification, setApiKeyCleanedNotification] =
    useState<boolean>(false)

  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([])
  const [isLoadingModels, setIsLoadingModels] = useState(false)
  const [modelLoadError, setModelLoadError] = useState<string | null>(null)
  const [modelSearchQuery, setModelSearchQuery] = useState<string>('')
  const [modelSearchCursorOffset, setModelSearchCursorOffset] =
    useState<number>(0)
  const [cursorOffset, setCursorOffset] = useState<number>(0)
  const [apiKeyEdited, setApiKeyEdited] = useState<boolean>(false)

  const [providerFocusIndex, setProviderFocusIndex] = useState(0)
  const [partnerProviderFocusIndex, setPartnerProviderFocusIndex] = useState(0)
  const [codingPlanFocusIndex, setCodingPlanFocusIndex] = useState(0)

  const [fetchRetryCount, setFetchRetryCount] = useState<number>(0)
  const [isRetrying, setIsRetrying] = useState<boolean>(false)

  const [isTestingConnection, setIsTestingConnection] = useState<boolean>(false)
  const [connectionTestResult, setConnectionTestResult] =
    useState<ConnectionTestResult | null>(null)

  const [validationError, setValidationError] = useState<string | null>(null)

  const [resourceName, setResourceName] = useState<string>('')
  const [resourceNameCursorOffset, setResourceNameCursorOffset] =
    useState<number>(0)
  const [customModelName, setCustomModelName] = useState<string>('')
  const [customModelNameCursorOffset, setCustomModelNameCursorOffset] =
    useState<number>(0)

  const [ollamaBaseUrl, setOllamaBaseUrl] = useState<string>(
    'http://localhost:11434/v1',
  )

  const [customBaseUrl, setCustomBaseUrl] = useState<string>('')
  const [customBaseUrlCursorOffset, setCustomBaseUrlCursorOffset] =
    useState<number>(0)

  const [providerBaseUrl, setProviderBaseUrl] = useState<string>('')
  const [providerBaseUrlCursorOffset, setProviderBaseUrlCursorOffset] =
    useState<number>(0)

  return {
    screenStack,
    setScreenStack,
    currentScreen,
    navigateTo,
    selectedProvider,
    setSelectedProvider,
    selectedModel,
    setSelectedModel,
    apiKey,
    setApiKey,
    maxTokens,
    setMaxTokens,
    maxTokensMode,
    setMaxTokensMode,
    selectedMaxTokensPreset,
    setSelectedMaxTokensPreset,
    reasoningEffort,
    setReasoningEffort,
    supportsReasoningEffort,
    setSupportsReasoningEffort,
    contextLength,
    setContextLength,
    requestStrategy,
    setRequestStrategy,
    activeFieldIndex,
    setActiveFieldIndex,
    maxTokensCursorOffset,
    setMaxTokensCursorOffset,
    apiKeyCleanedNotification,
    setApiKeyCleanedNotification,
    availableModels,
    setAvailableModels,
    isLoadingModels,
    setIsLoadingModels,
    modelLoadError,
    setModelLoadError,
    modelSearchQuery,
    setModelSearchQuery,
    modelSearchCursorOffset,
    setModelSearchCursorOffset,
    cursorOffset,
    setCursorOffset,
    apiKeyEdited,
    setApiKeyEdited,
    providerFocusIndex,
    setProviderFocusIndex,
    partnerProviderFocusIndex,
    setPartnerProviderFocusIndex,
    codingPlanFocusIndex,
    setCodingPlanFocusIndex,
    fetchRetryCount,
    setFetchRetryCount,
    isRetrying,
    setIsRetrying,
    isTestingConnection,
    setIsTestingConnection,
    connectionTestResult,
    setConnectionTestResult,
    validationError,
    setValidationError,
    resourceName,
    setResourceName,
    resourceNameCursorOffset,
    setResourceNameCursorOffset,
    customModelName,
    setCustomModelName,
    customModelNameCursorOffset,
    setCustomModelNameCursorOffset,
    ollamaBaseUrl,
    setOllamaBaseUrl,
    customBaseUrl,
    setCustomBaseUrl,
    customBaseUrlCursorOffset,
    setCustomBaseUrlCursorOffset,
    providerBaseUrl,
    setProviderBaseUrl,
    providerBaseUrlCursorOffset,
    setProviderBaseUrlCursorOffset,
  }
}

export type ModelSelectorState = ReturnType<typeof useModelSelectorState>
