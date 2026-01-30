import type { ConnectionTestResult, GPT5TestConfig } from './types'
import { debug as debugLogger } from '../debugLogger'

/**
 * Test using Chat Completions API with GPT-5 compatibility
 */
export async function testChatCompletionsAPI(
  config: GPT5TestConfig,
  baseURL: string,
  startTime: number,
): Promise<ConnectionTestResult> {
  const testURL = `${baseURL.replace(/\/+$/, '')}/chat/completions`

  const isGPT5 = config.model.toLowerCase().includes('gpt-5')

  // Create test payload with GPT-5 compatibility
  const testPayload: any = {
    model: config.model,
    messages: [
      {
        role: 'user',
        content:
          'Please respond with exactly \"YES\" (in capital letters) to confirm this connection is working.',
      },
    ],
    temperature: isGPT5 ? 1 : 0, // GPT-5 requires temperature=1
    stream: false,
  }

  // 🔧 Apply GPT-5 parameter transformations
  if (isGPT5) {
    testPayload.max_completion_tokens = Math.max(config.maxTokens || 8192, 8192)
    delete testPayload.max_tokens // 🔥 CRITICAL: Remove max_tokens for GPT-5
    debugLogger.api('GPT5_CONNECTION_TEST_MAX_COMPLETION_TOKENS', {
      model: config.model,
      max_completion_tokens: testPayload.max_completion_tokens,
    })
  } else {
    testPayload.max_tokens = Math.max(config.maxTokens || 8192, 8192)
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  // Add provider-specific headers
  if (config.provider === 'azure') {
    headers['api-key'] = config.apiKey
  } else {
    headers['Authorization'] = `Bearer ${config.apiKey}`
  }

  debugLogger.api('GPT5_CONNECTION_TEST_CHAT_COMPLETIONS_REQUEST', {
    model: config.model,
    url: testURL,
  })

  try {
    const response = await fetch(testURL, {
      method: 'POST',
      headers,
      body: JSON.stringify(testPayload),
    })

    const responseTime = Date.now() - startTime

    if (response.ok) {
      const data = await response.json()
      debugLogger.api('GPT5_CONNECTION_TEST_CHAT_COMPLETIONS_RESPONSE', {
        model: config.model,
        status: response.status,
      })

      const responseContent = data.choices?.[0]?.message?.content || ''
      const containsYes = responseContent.toLowerCase().includes('yes')

      if (containsYes) {
        return {
          success: true,
          message: `${isGPT5 ? 'GPT-5' : 'Model'} Chat Completions connection successful`,
          endpoint: '/chat/completions',
          details: `Model responded correctly: \"${responseContent.trim()}\"`,
          apiUsed: 'chat_completions',
          responseTime,
        }
      }

      return {
        success: false,
        message:
          'Chat Completions connected but returned an unexpected response',
        endpoint: '/chat/completions',
        details: `Expected \"YES\" but got: \"${responseContent.trim() || '(empty response)'}\"`,
        apiUsed: 'chat_completions',
        responseTime,
      }
    }

    const errorData = await response.json().catch(() => null)
    const errorMessage =
      errorData?.error?.message || errorData?.message || response.statusText

    debugLogger.warn('GPT5_CONNECTION_TEST_CHAT_COMPLETIONS_ERROR', {
      model: config.model,
      status: response.status,
      error: errorMessage,
    })

    // 🔧 Provide specific guidance for GPT-5 errors
    let details = `Error: ${errorMessage}`
    if (
      response.status === 400 &&
      errorMessage.includes('max_tokens') &&
      isGPT5
    ) {
      details +=
        '\n\nGPT-5 note: This error suggests a parameter compatibility issue. Check whether the provider supports GPT-5 with max_completion_tokens.'
    }

    return {
      success: false,
      message: `Chat Completions failed (${response.status})`,
      endpoint: '/chat/completions',
      details: details,
      apiUsed: 'chat_completions',
      responseTime: Date.now() - startTime,
    }
  } catch (error) {
    debugLogger.warn('GPT5_CONNECTION_TEST_CHAT_COMPLETIONS_NETWORK_ERROR', {
      model: config.model,
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      success: false,
      message: 'Chat Completions connection failed',
      endpoint: '/chat/completions',
      details: error instanceof Error ? error.message : String(error),
      apiUsed: 'chat_completions',
      responseTime: Date.now() - startTime,
    }
  }
}
