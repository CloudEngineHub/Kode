import type { ProviderType } from '#core/utils/config'
import type { RequestStrategy } from '#config'

export type ConnectionTestResult = {
  success: boolean
  message: string
  endpoint?: string
  details?: string
  phase?: string
  attempt?: number
  maxAttempts?: number
  fallbackStep?: string
  errorCategory?: string
  retryInMs?: number
}

export type ConnectionTestParams = {
  selectedProvider: ProviderType
  selectedModel: string
  apiKey: string
  maxTokens: string
  providerBaseUrl: string
  customBaseUrl: string
  resourceName: string
  requestStrategy: RequestStrategy
}
