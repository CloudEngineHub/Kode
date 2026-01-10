import { useEffect, useMemo } from 'react'
import { getTheme } from '#core/utils/theme'
import { useExitOnCtrlCD } from '#ui-ink/hooks/useExitOnCtrlCD'
import { useTerminalSize } from '#ui-ink/hooks/useTerminalSize'
import {
  CONTEXT_LENGTH_OPTIONS,
  DEFAULT_CONTEXT_LENGTH,
} from '#ui-ink/ui/components/model-selector/options'
import { printModelConfig } from '#ui-ink/ui/components/model-selector/printModelConfig'
import type { ModelSelectorProps } from './types'
import type { ModelSelectorViewProps } from './viewTypes'
import { useModelSelectorInput } from './useModelSelectorInput'
import { useModelSelectorMenus } from './useModelSelectorMenus'
import { useModelSelectorModelOptions } from './useModelSelectorModelOptions'
import { useModelSelectorState } from './useModelSelectorState'
import { useModelSelectorActions } from './useModelSelectorActions'
import { useEscapeNavigation } from '#ui-ink/ui/components/model-selector/useEscapeNavigation'

function normalizeProviderForApiKeyEnvVar(provider: string): string {
  // Some "coding plan" providers share auth with their base provider.
  if (provider === 'glm-coding') return 'glm'
  if (provider === 'minimax-coding') return 'minimax'
  return provider
}

function getApiKeyEnvVarNames(provider: string): string[] {
  const normalizedProvider = normalizeProviderForApiKeyEnvVar(provider)
  const sanitizedProvider = normalizedProvider.replace(/[^a-z0-9]/gi, '_')
  const canonical = `${sanitizedProvider.toUpperCase()}_API_KEY`
  const legacy = `${normalizedProvider.toUpperCase()}_API_KEY`
  return canonical === legacy ? [canonical] : [canonical, legacy]
}

function readApiKeyFromEnv(provider: string): string | undefined {
  for (const envVarName of getApiKeyEnvVarNames(provider)) {
    const value = process.env[envVarName]
    if (value) return value
  }
  return undefined
}

export function useModelSelectorController(
  props: ModelSelectorProps,
): ModelSelectorViewProps {
  const theme = getTheme()
  const { rows: terminalRows, columns: terminalColumns } = useTerminalSize()
  const tightLayout = terminalRows <= 18 || terminalColumns <= 66
  const compactLayout = tightLayout || terminalRows <= 22 || terminalColumns <= 76
  const containerPaddingY = tightLayout ? 0 : compactLayout ? 0 : 1
  const containerGap = tightLayout ? 0 : 1

  const exitState = useExitOnCtrlCD(() => process.exit(0))
  const exitStateForScreens = useMemo(
    () => ({ pending: exitState.pending, keyName: exitState.keyName ?? '' }),
    [exitState.pending, exitState.keyName],
  )

  const onDone = () => {
    printModelConfig()
    props.onDone()
  }

  const state = useModelSelectorState({
    skipModelType: props.skipModelType ?? false,
  })

  const menus = useModelSelectorMenus({
    containerPaddingY,
    containerGap,
    setProviderFocusIndex: state.setProviderFocusIndex,
    setPartnerProviderFocusIndex: state.setPartnerProviderFocusIndex,
    setCodingPlanFocusIndex: state.setCodingPlanFocusIndex,
  })

  const { modelOptions } = useModelSelectorModelOptions({
    selectedProvider: state.selectedProvider,
    availableModels: state.availableModels,
    modelSearchQuery: state.modelSearchQuery,
  })

  useEffect(() => {
    if (!state.apiKeyEdited && state.selectedProvider) {
      const envValue = readApiKeyFromEnv(state.selectedProvider) ?? ''
      state.setApiKey(envValue)
      state.setCursorOffset(envValue.length)
    }
  }, [
    state.apiKeyEdited,
    state.selectedProvider,
    state.setApiKey,
    state.setCursorOffset,
  ])

  useEffect(() => {
    if (
      state.currentScreen === 'contextLength' &&
      !CONTEXT_LENGTH_OPTIONS.find(opt => opt.value === state.contextLength)
    ) {
      state.setContextLength(DEFAULT_CONTEXT_LENGTH)
    }
  }, [state.contextLength, state.currentScreen, state.setContextLength])

  const actions = useModelSelectorActions({ props, state, onDone })

  useEscapeNavigation(actions.handleBack, props.abortController)

  useModelSelectorInput({
    currentScreen: state.currentScreen,
    mainMenuOptions: menus.mainMenuOptions,
    providerFocusIndex: state.providerFocusIndex,
    setProviderFocusIndex: state.setProviderFocusIndex,
    partnerProviderOptions: menus.partnerProviderOptions,
    partnerProviderFocusIndex: state.partnerProviderFocusIndex,
    setPartnerProviderFocusIndex: state.setPartnerProviderFocusIndex,
    codingPlanOptions: menus.codingPlanOptions,
    codingPlanFocusIndex: state.codingPlanFocusIndex,
    setCodingPlanFocusIndex: state.setCodingPlanFocusIndex,
    selectedProvider: state.selectedProvider,
    apiKey: state.apiKey,
    resourceName: state.resourceName,
    providerBaseUrl: state.providerBaseUrl,
    customBaseUrl: state.customBaseUrl,
    customModelName: state.customModelName,
    contextLength: state.contextLength,
    setContextLength: state.setContextLength,
    isTestingConnection: state.isTestingConnection,
    connectionTestResult: state.connectionTestResult,
    activeFieldIndex: state.activeFieldIndex,
    setActiveFieldIndex: state.setActiveFieldIndex,
    handleProviderSelection: actions.handleProviderSelection,
    handleApiKeySubmit: actions.handleApiKeySubmit,
    fetchModelsWithRetry: actions.fetchModelsWithRetry,
    navigateTo: state.navigateTo,
    handleResourceNameSubmit: actions.handleResourceNameSubmit,
    handleCustomBaseUrlSubmit: actions.handleCustomBaseUrlSubmit,
    handleProviderBaseUrlSubmit: actions.handleProviderBaseUrlSubmit,
    handleCustomModelSubmit: actions.handleCustomModelSubmit,
    handleConfirmation: actions.handleConfirmation,
    setValidationError: state.setValidationError,
    handleConnectionTest: actions.handleConnectionTest,
    handleContextLengthSubmit: actions.handleContextLengthSubmit,
    setModelLoadError: state.setModelLoadError,
    getFormFieldsForModelParams: actions.getFormFieldsForModelParams,
    handleModelParamsSubmit: actions.handleModelParamsSubmit,
  })

  return {
    theme,
    exitState: exitStateForScreens,
    terminalRows,
    terminalColumns,
    compactLayout,
    tightLayout,
    containerPaddingY,
    containerGap,
    currentScreen: state.currentScreen,
    selectedProvider: state.selectedProvider,
    selectedModel: state.selectedModel,
    apiKey: state.apiKey,
    cursorOffset: state.cursorOffset,
    handleApiKeyChange: actions.handleApiKeyChange,
    handleApiKeySubmit: actions.handleApiKeySubmit,
    handleCursorOffsetChange: actions.handleCursorOffsetChange,
    apiKeyCleanedNotification: state.apiKeyCleanedNotification,
    isLoadingModels: state.isLoadingModels,
    modelLoadError: state.modelLoadError,
    providerBaseUrl: state.providerBaseUrl,
    setProviderBaseUrl: state.setProviderBaseUrl,
    providerBaseUrlCursorOffset: state.providerBaseUrlCursorOffset,
    setProviderBaseUrlCursorOffset: state.setProviderBaseUrlCursorOffset,
    customBaseUrl: state.customBaseUrl,
    setCustomBaseUrl: state.setCustomBaseUrl,
    customBaseUrlCursorOffset: state.customBaseUrlCursorOffset,
    setCustomBaseUrlCursorOffset: state.setCustomBaseUrlCursorOffset,
    customModelName: state.customModelName,
    setCustomModelName: state.setCustomModelName,
    customModelNameCursorOffset: state.customModelNameCursorOffset,
    setCustomModelNameCursorOffset: state.setCustomModelNameCursorOffset,
    resourceName: state.resourceName,
    setResourceName: state.setResourceName,
    resourceNameCursorOffset: state.resourceNameCursorOffset,
    setResourceNameCursorOffset: state.setResourceNameCursorOffset,
    availableModels: state.availableModels,
    modelSearchQuery: state.modelSearchQuery,
    modelSearchCursorOffset: state.modelSearchCursorOffset,
    handleModelSearchChange: actions.handleModelSearchChange,
    handleModelSearchCursorOffsetChange:
      actions.handleModelSearchCursorOffsetChange,
    modelOptions,
    handleResourceNameSubmit: actions.handleResourceNameSubmit,
    handleCustomBaseUrlSubmit: actions.handleCustomBaseUrlSubmit,
    handleProviderBaseUrlSubmit: actions.handleProviderBaseUrlSubmit,
    handleCustomModelSubmit: actions.handleCustomModelSubmit,
    handleModelSelection: actions.handleModelSelection,
    handleModelParamsSubmit: actions.handleModelParamsSubmit,
    maxTokens: state.maxTokens,
    setMaxTokens: state.setMaxTokens,
    setSelectedMaxTokensPreset: state.setSelectedMaxTokensPreset,
    setMaxTokensCursorOffset: state.setMaxTokensCursorOffset,
    supportsReasoningEffort: state.supportsReasoningEffort,
    reasoningEffortOptions: actions.reasoningEffortOptions,
    reasoningEffort: state.reasoningEffort,
    setReasoningEffort: state.setReasoningEffort,
    requestStrategy: state.requestStrategy,
    requestStrategyOptions: actions.requestStrategyOptions,
    setRequestStrategy: state.setRequestStrategy,
    contextLength: state.contextLength,
    isTestingConnection: state.isTestingConnection,
    connectionTestResult: state.connectionTestResult,
    validationError: state.validationError,
    ollamaBaseUrl: state.ollamaBaseUrl,
    activeFieldIndex: state.activeFieldIndex,
    setActiveFieldIndex: state.setActiveFieldIndex,
    getFormFieldsForModelParams: actions.getFormFieldsForModelParams,
    mainMenuOptions: menus.mainMenuOptions,
    providerFocusIndex: state.providerFocusIndex,
    providerReservedLines: menus.providerReservedLines,
    partnerProviderOptions: menus.partnerProviderOptions,
    partnerProviderFocusIndex: state.partnerProviderFocusIndex,
    partnerReservedLines: menus.partnerReservedLines,
    codingPlanOptions: menus.codingPlanOptions,
    codingPlanFocusIndex: state.codingPlanFocusIndex,
    codingReservedLines: menus.codingReservedLines,
    formatApiKeyDisplay: actions.formatApiKeyDisplay,
    getProviderLabel: menus.getProviderLabel,
  }
}
