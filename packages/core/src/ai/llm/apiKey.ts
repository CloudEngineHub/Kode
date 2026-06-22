import Anthropic from '@anthropic-ai/sdk'
import type { MessageParam } from '@anthropic-ai/sdk/resources/index.mjs'

import { logError } from '#core/utils/log'
import { USER_AGENT } from '#core/utils/http'
import { withRetry } from '#core/ai/llm/retry'
import { debug as debugLogger } from '#core/utils/debugLogger'

/**
 * Fetch available models from Anthropic API.
 */
export async function fetchAnthropicModels(
  baseURL: string,
  apiKey: string,
): Promise<any[]> {
  try {
    // Use provided baseURL or default to official Anthropic API
    const modelsURL = baseURL
      ? `${baseURL.replace(/\/+$/, '')}/v1/models`
      : 'https://api.anthropic.com/v1/models'

    const response = await fetch(modelsURL, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'User-Agent': USER_AGENT,
      },
    })

    if (!response.ok) {
      // Provide user-friendly error messages based on status code
      if (response.status === 401) {
        throw new Error(
          'Invalid API key. Please check your Anthropic API key and try again.',
        )
      } else if (response.status === 403) {
        throw new Error(
          'API key does not have permission to access models. Please check your API key permissions.',
        )
      } else if (response.status === 429) {
        throw new Error(
          'Too many requests. Please wait a moment and try again.',
        )
      } else if (response.status >= 500) {
        throw new Error(
          'Anthropic service is temporarily unavailable. Please try again later.',
        )
      } else {
        throw new Error(
          `Unable to connect to Anthropic API (${response.status}). Please check your internet connection and API key.`,
        )
      }
    }

    const data = await response.json()
    return data.data || []
  } catch (error) {
    // If it's already our custom error, pass it through
    if (
      (error instanceof Error && error.message.includes('API key')) ||
      (error instanceof Error && error.message.includes('Anthropic'))
    ) {
      throw error
    }

    // For network errors or other issues
    logError(error)
    debugLogger.warn('ANTHROPIC_MODELS_FETCH_FAILED', {
      error: error instanceof Error ? error.message : String(error),
    })
    throw new Error(
      'Unable to connect to Anthropic API. Please check your internet connection and try again.',
    )
  }
}

export async function verifyApiKey(
  apiKey: string,
  baseURL?: string,
  provider?: string,
): Promise<boolean> {
  if (!apiKey) {
    return false
  }

  // For non-Anthropic providers, use OpenAI-compatible verification
  if (provider && provider !== 'anthropic') {
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      }

      if (!baseURL) {
        debugLogger.warn('API_VERIFICATION_MISSING_BASE_URL', { provider })
        return false
      }

      const modelsURL = `${baseURL.replace(/\/+$/, '')}/models`

      const response = await fetch(modelsURL, {
        method: 'GET',
        headers,
      })

      return response.ok
    } catch (error) {
      logError(error)
      debugLogger.warn('API_VERIFICATION_FAILED', {
        provider,
        error: error instanceof Error ? error.message : String(error),
      })
      return false
    }
  }

  // For Anthropic and Anthropic-compatible APIs
  const clientConfig: any = {
    apiKey,
    dangerouslyAllowBrowser: true,
    maxRetries: 3,
    defaultHeaders: {
      'User-Agent': USER_AGENT,
    },
  }

  // Only add baseURL for true Anthropic-compatible APIs
  if (baseURL && (provider === 'anthropic' || provider === 'minimax-coding')) {
    clientConfig.baseURL = baseURL
  }

  const anthropic = new Anthropic(clientConfig)

  try {
    await withRetry(
      async () => {
        const model = 'claude-sonnet-4-20250514'
        const messages: MessageParam[] = [{ role: 'user', content: 'test' }]
        await anthropic.messages.create({
          model,
          max_tokens: 1000, // Simple test token limit for API verification
          messages,
          temperature: 0,
        })
        return true
      },
      { maxRetries: 2 }, // Use fewer retries for API key verification
    )
    return true
  } catch (error) {
    logError(error)
    // Check for authentication error
    if (
      error instanceof Error &&
      error.message.includes(
        '{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}',
      )
    ) {
      return false
    }
    throw error
  }
}
