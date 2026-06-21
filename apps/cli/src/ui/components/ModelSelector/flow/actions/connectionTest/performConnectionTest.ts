import { providers } from '#core/constants/models'
import { isOpenAICompatibleProvider } from './openAICompatibility'
import type { ConnectionTestParams, ConnectionTestResult } from './types'
import { testChatEndpoint } from './testChatEndpoint'
import { testProviderSpecificEndpoint } from './testProviderSpecificEndpoint'
import { buildRequestStrategyFallbackPlan } from '#core/ai/llm/restrictedClientCompat'

export async function performConnectionTest(
  {
    selectedProvider,
    selectedModel,
    apiKey,
    maxTokens,
    providerBaseUrl,
    customBaseUrl,
    resourceName,
    requestStrategy,
  }: ConnectionTestParams,
  options?: {
    onProgress?: (result: ConnectionTestResult) => void
  },
): Promise<ConnectionTestResult> {
  try {
    let testBaseURL =
      providerBaseUrl || providers[selectedProvider]?.baseURL || ''

    if (selectedProvider === 'azure') {
      testBaseURL = `https://${resourceName}.openai.azure.com/openai/deployments/${selectedModel}`
    } else if (selectedProvider === 'custom-openai') {
      testBaseURL = customBaseUrl
    }

    const isOpenAICompatible = isOpenAICompatibleProvider(selectedProvider)

    if (isOpenAICompatible) {
      const endpointsToTry: Array<{ path: string; name: string }> = []

      if (selectedProvider === 'azure') {
        const azureApiVersion = '2024-06-01'
        endpointsToTry.push({
          path: `/chat/completions?api-version=${azureApiVersion}`,
          name: 'Azure OpenAI',
        })
      } else if (selectedProvider === 'minimax') {
        endpointsToTry.push(
          { path: '/text/chatcompletion_v2', name: 'MiniMax v2 (recommended)' },
          { path: '/chat/completions', name: 'Standard OpenAI' },
        )
      } else {
        endpointsToTry.push({
          path: '/chat/completions',
          name: 'Standard OpenAI',
        })
      }

      let lastError: ConnectionTestResult | null = null
      const fallbackPlan = buildRequestStrategyFallbackPlan(
        requestStrategy,
        selectedModel,
      )

      for (const endpoint of endpointsToTry) {
        for (const step of fallbackPlan) {
          options?.onProgress?.({
            success: false,
            phase: 'request',
            message: `Testing ${endpoint.name} (${endpoint.path}) with ${step.name}...`,
            endpoint: endpoint.path,
            fallbackStep: step.name,
          })

          const testResult = await testChatEndpoint({
            baseURL: testBaseURL,
            endpointPath: endpoint.path,
            endpointName: endpoint.name,
            selectedProvider,
            selectedModel,
            apiKey,
            maxTokens,
            requestHeadersProfile: step.headers,
            systemPromptProfile: step.systemPrompt,
            fallbackStepName: step.name,
            onProgress: options?.onProgress,
          })

          if (testResult.success) {
            return testResult
          }

          lastError = testResult

          // Only advance to the next fallback step when we have evidence the provider
          // is enforcing a specific client fingerprint for an upstream-compat profile.
          if (testResult.errorCategory === 'restricted_client_only') {
            continue
          }

          // For non-compat-only failures, stop trying more fallback profiles for this endpoint.
          break
        }
      }

      return (
        lastError || {
          success: false,
          message: 'All endpoints failed',
          details: 'No endpoints could be reached',
        }
      )
    }

    let lastError: ConnectionTestResult | null = null
    const fallbackPlan = buildRequestStrategyFallbackPlan(
      requestStrategy,
      selectedModel,
    )

    for (const step of fallbackPlan) {
      options?.onProgress?.({
        success: false,
        phase: 'request',
        message: `Testing ${selectedProvider} with ${step.name}...`,
        endpoint: '/v1/messages',
        fallbackStep: step.name,
      })

      const result = await testProviderSpecificEndpoint({
        baseURL: testBaseURL,
        selectedProvider,
        selectedModel,
        apiKey,
        maxTokens,
        requestHeadersProfile: step.headers,
        systemPromptProfile: step.systemPrompt,
        fallbackStepName: step.name,
        onProgress: options?.onProgress,
      })

      if (result.success) {
        return result
      }

      lastError = result

      if (result.errorCategory === 'restricted_client_only') {
        continue
      }

      break
    }

    return (
      lastError || {
        success: false,
        message: 'Connection test failed',
        details: 'No provider-specific endpoint could be reached',
      }
    )
  } catch (error) {
    return {
      success: false,
      message: 'Connection test failed',
      details: error instanceof Error ? error.message : String(error),
    }
  }
}
