import type { ProviderType } from '#core/utils/config'
import type { ConnectionTestResult } from './types'
import type {
  RequestHeadersProfile,
  SystemPromptProfile,
} from '#core/ai/llm/restrictedClientCompat'
import { testAnthropicMessagesEndpoint } from './testAnthropicMessagesEndpoint'

export async function testProviderSpecificEndpoint({
  baseURL,
  selectedProvider,
  selectedModel,
  apiKey,
  maxTokens,
  requestHeadersProfile,
  systemPromptProfile,
  fallbackStepName,
  onProgress,
}: {
  baseURL: string
  selectedProvider: ProviderType
  selectedModel: string
  apiKey: string
  maxTokens: string
  requestHeadersProfile: RequestHeadersProfile
  systemPromptProfile: SystemPromptProfile
  fallbackStepName: string
  onProgress?: (result: ConnectionTestResult) => void
}): Promise<ConnectionTestResult> {
  const isAnthropicCompatible =
    selectedProvider === 'anthropic' ||
    selectedProvider === 'bigdream' ||
    selectedProvider === 'opendev' ||
    selectedProvider === 'minimax-coding'

  if (isAnthropicCompatible) {
    return await testAnthropicMessagesEndpoint({
      baseURL,
      selectedProvider,
      selectedModel,
      apiKey,
      maxTokens,
      requestHeadersProfile,
      systemPromptProfile,
      fallbackStepName,
      onProgress,
    })
  }

  return {
    success: false,
    message: `${selectedProvider} connection test not implemented`,
    details:
      'This provider does not have a dedicated connection test yet. Choose an OpenAI-compatible provider (or a custom OpenAI base URL), or use an Anthropic-compatible provider/base URL.',
  }
}
