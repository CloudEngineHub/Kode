import type { ConnectionTestResult, GPT5TestConfig } from './types'
import { debug as debugLogger } from '../debugLogger'

/**
 * Test using GPT-5 Responses API
 */
export async function testResponsesAPI(
  config: GPT5TestConfig,
  baseURL: string,
  startTime: number,
): Promise<ConnectionTestResult> {
  const testURL = `${baseURL.replace(/\/+$/, '')}/responses`

  const testPayload = {
    model: config.model,
    input: [
      {
        role: 'user',
        content:
          'Please respond with exactly \"YES\" (in capital letters) to confirm this connection is working.',
      },
    ],
    max_completion_tokens: Math.max(config.maxTokens || 8192, 8192),
    temperature: 1, // GPT-5 requirement
    reasoning: {
      effort: 'low', // Fast response for connection test
    },
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
  }

  debugLogger.api('GPT5_CONNECTION_TEST_RESPONSES_REQUEST', {
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
      debugLogger.api('GPT5_CONNECTION_TEST_RESPONSES_RESPONSE', {
        model: config.model,
        status: response.status,
      })

      // Extract content from Responses API format
      let responseContent = ''
      if (data.output_text) {
        responseContent = data.output_text
      } else if (data.output && Array.isArray(data.output)) {
        // Extract from structured output format
        const messageOutput = data.output.find(
          (item: any) => item.type === 'message',
        )
        if (messageOutput && messageOutput.content) {
          const textContent = messageOutput.content.find(
            (c: any) => c.type === 'output_text',
          )
          responseContent = textContent?.text || ''
        }
      }

      const containsYes = responseContent.toLowerCase().includes('yes')

      if (containsYes) {
        return {
          success: true,
          message: 'GPT-5 Responses API connection successful',
          endpoint: '/responses',
          details: `Model responded correctly: \"${responseContent.trim()}\"`,
          apiUsed: 'responses',
          responseTime,
        }
      }

      return {
        success: false,
        message: 'Responses API connected but returned an unexpected response',
        endpoint: '/responses',
        details: `Expected \"YES\" but got: \"${responseContent.trim() || '(empty response)'}\"`,
        apiUsed: 'responses',
        responseTime,
      }
    }

    const errorData = await response.json().catch(() => null)
    const errorMessage =
      errorData?.error?.message || errorData?.message || response.statusText

    debugLogger.warn('GPT5_CONNECTION_TEST_RESPONSES_ERROR', {
      model: config.model,
      status: response.status,
      error: errorMessage,
    })

    return {
      success: false,
      message: `Responses API failed (${response.status})`,
      endpoint: '/responses',
      details: `Error: ${errorMessage}`,
      apiUsed: 'responses',
      responseTime: Date.now() - startTime,
    }
  } catch (error) {
    debugLogger.warn('GPT5_CONNECTION_TEST_RESPONSES_NETWORK_ERROR', {
      model: config.model,
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      success: false,
      message: 'Responses API connection failed',
      endpoint: '/responses',
      details: error instanceof Error ? error.message : String(error),
      apiUsed: 'responses',
      responseTime: Date.now() - startTime,
    }
  }
}
