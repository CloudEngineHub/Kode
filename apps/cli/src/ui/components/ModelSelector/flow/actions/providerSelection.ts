import type { ProviderType } from '#core/utils/config'
import { providers } from '#core/constants/models'

import type { ModelSelectorScreen } from '../state'

type Deps = {
  navigateTo: (screen: ModelSelectorScreen) => void
  setPartnerProviderFocusIndex: (idx: number) => void
  setCodingPlanFocusIndex: (idx: number) => void
  setSelectedProvider: (provider: ProviderType) => void
  setProviderBaseUrl: (baseUrl: string) => void
  saveConfiguration: (
    provider: ProviderType,
    model: string,
  ) => Promise<string | null>
  onDone: () => void
  selectedModel: string
}

export async function handleProviderSelection(provider: string, deps: Deps) {
  const {
    navigateTo,
    setPartnerProviderFocusIndex,
    setCodingPlanFocusIndex,
    setSelectedProvider,
    setProviderBaseUrl,
    saveConfiguration,
    onDone,
    selectedModel,
  } = deps

  // Handle main menu navigation
  if (provider === 'partnerProviders') {
    setPartnerProviderFocusIndex(0)
    navigateTo('partnerProviders')
    return
  } else if (provider === 'partnerCodingPlans') {
    setCodingPlanFocusIndex(0)
    navigateTo('partnerCodingPlans')
    return
  } else if (provider === 'custom-anthropic') {
    // For custom Anthropic API, go to base URL screen
    setSelectedProvider('anthropic' as ProviderType)
    setProviderBaseUrl('')
    navigateTo('baseUrl')
    return
  }

  // Handle actual provider selection
  const providerType = provider as ProviderType
  setSelectedProvider(providerType)

  if (provider === 'custom') {
    // For custom provider, save and exit
    const modelId = await saveConfiguration(providerType, selectedModel || '')
    if (modelId) {
      onDone()
    }
  } else if (provider === 'custom-openai' || provider === 'ollama') {
    // For custom-openai and ollama, need to configure base URL
    const defaultBaseUrl = providers[providerType]?.baseURL || ''
    setProviderBaseUrl(defaultBaseUrl)
    navigateTo('baseUrl')
  } else {
    // For all standard partner providers, skip baseUrl and go directly to API key
    const defaultBaseUrl = providers[providerType]?.baseURL || ''
    setProviderBaseUrl(defaultBaseUrl)
    navigateTo('apiKey')
  }
}
