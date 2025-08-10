import { OpenAI } from 'openai'
import { getGlobalConfig, GlobalConfig } from '../utils/config'
import { ProxyAgent, fetch, Response } from 'undici'
import { setSessionState, getSessionState } from '../utils/sessionState'
import { logEvent } from '../services/statsig'
import { debug as debugLogger } from '../utils/debugLogger'

// Helper function to calculate retry delay with exponential backoff
function getRetryDelay(attempt: number, retryAfter?: string | null): number {
  // If server suggests a retry-after time, use it
  if (retryAfter) {
    const retryAfterMs = parseInt(retryAfter) * 1000
    if (!isNaN(retryAfterMs) && retryAfterMs > 0) {
      return Math.min(retryAfterMs, 60000) // Cap at 60 seconds
    }
  }

  // Exponential backoff: base delay of 1 second, doubling each attempt
  const baseDelay = 1000
  const maxDelay = 32000 // Cap at 32 seconds
  const delay = baseDelay * Math.pow(2, attempt - 1)

  // Add some jitter to avoid thundering herd
  const jitter = Math.random() * 0.1 * delay

  return Math.min(delay + jitter, maxDelay)
}

// Helper function to create an abortable delay
function abortableDelay(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    // Check if already aborted
    if (signal?.aborted) {
      reject(new Error('Request was aborted'))
      return
    }

    const timeoutId = setTimeout(() => {
      resolve()
    }, delayMs)

    // If signal is provided, listen for abort event
    if (signal) {
      const abortHandler = () => {
        clearTimeout(timeoutId)
        reject(new Error('Request was aborted'))
      }
      signal.addEventListener('abort', abortHandler, { once: true })
    }
  })
}

enum ModelErrorType {
  MaxLength = '1024',
  MaxCompletionTokens = 'max_completion_tokens',
  StreamOptions = 'stream_options',
  Citations = 'citations',
  RateLimit = 'rate_limit',
}

function getModelErrorKey(
  baseURL: string,
  model: string,
  type: ModelErrorType,
): string {
  return `${baseURL}:${model}:${type}`
}

function hasModelError(
  baseURL: string,
  model: string,
  type: ModelErrorType,
): boolean {
  return !!getSessionState('modelErrors')[
    getModelErrorKey(baseURL, model, type)
  ]
}

function setModelError(
  baseURL: string,
  model: string,
  type: ModelErrorType,
  error: string,
) {
  setSessionState('modelErrors', {
    [getModelErrorKey(baseURL, model, type)]: error,
  })
}

// More flexible error detection system
type ErrorDetector = (errMsg: string) => boolean
type ErrorFixer = (
  opts: OpenAI.ChatCompletionCreateParams,
) => Promise<void> | void
interface ErrorHandler {
  type: ModelErrorType
  detect: ErrorDetector
  fix: ErrorFixer
}

// Standard error handlers
const ERROR_HANDLERS: ErrorHandler[] = [
  {
    type: ModelErrorType.MaxLength,
    detect: errMsg =>
      errMsg.includes('Expected a string with maximum length 1024'),
    fix: async opts => {
      const toolDescriptions = {}
      for (const tool of opts.tools || []) {
        if (tool.function.description.length <= 1024) continue
        let str = ''
        let remainder = ''
        for (let line of tool.function.description.split('\n')) {
          if (str.length + line.length < 1024) {
            str += line + '\n'
          } else {
            remainder += line + '\n'
          }
        }
        logEvent('truncated_tool_description', {
          name: tool.function.name,
          original_length: String(tool.function.description.length),
          truncated_length: String(str.length),
          remainder_length: String(remainder.length),
        })
        tool.function.description = str
        toolDescriptions[tool.function.name] = remainder
      }
      if (Object.keys(toolDescriptions).length > 0) {
        let content = '<additional-tool-usage-instructions>\n\n'
        for (const [name, description] of Object.entries(toolDescriptions)) {
          content += `<${name}>\n${description}\n</${name}>\n\n`
        }
        content += '</additional-tool-usage-instructions>'

        for (let i = opts.messages.length - 1; i >= 0; i--) {
          if (opts.messages[i].role === 'system') {
            opts.messages.splice(i + 1, 0, {
              role: 'system',
              content,
            })
            break
          }
        }
      }
    },
  },
  {
    type: ModelErrorType.MaxCompletionTokens,
    detect: errMsg => errMsg.includes("Use 'max_completion_tokens'"),
    fix: async opts => {
      opts.max_completion_tokens = opts.max_tokens
      delete opts.max_tokens
    },
  },
  {
    type: ModelErrorType.StreamOptions,
    detect: errMsg => errMsg.includes('stream_options'),
    fix: async opts => {
      delete opts.stream_options
    },
  },
  {
    type: ModelErrorType.Citations,
    detect: errMsg =>
      errMsg.includes('Extra inputs are not permitted') &&
      errMsg.includes('citations'),
    fix: async opts => {
      if (!opts.messages) return

      for (const message of opts.messages) {
        if (!message) continue

        if (Array.isArray(message.content)) {
          for (const item of message.content) {
            // Convert to unknown first to safely access properties
            if (item && typeof item === 'object') {
              const itemObj = item as unknown as Record<string, unknown>
              if ('citations' in itemObj) {
                delete itemObj.citations
              }
            }
          }
        } else if (message.content && typeof message.content === 'object') {
          // Convert to unknown first to safely access properties
          const contentObj = message.content as unknown as Record<
            string,
            unknown
          >
          if ('citations' in contentObj) {
            delete contentObj.citations
          }
        }
      }
    },
  },
]

// Rate limit specific detection
function isRateLimitError(errMsg: string): boolean {
  if (!errMsg) return false
  const lowerMsg = errMsg.toLowerCase()
  return (
    lowerMsg.includes('rate limit') ||
    lowerMsg.includes('too many requests') ||
    lowerMsg.includes('429')
  )
}

// Model-specific feature flags - can be extended with more properties as needed
interface ModelFeatures {
  usesMaxCompletionTokens: boolean
}

// Map of model identifiers to their specific features
const MODEL_FEATURES: Record<string, ModelFeatures> = {
  // OpenAI thinking models
  o1: { usesMaxCompletionTokens: true },
  'o1-preview': { usesMaxCompletionTokens: true },
  'o1-mini': { usesMaxCompletionTokens: true },
  'o1-pro': { usesMaxCompletionTokens: true },
  'o3-mini': { usesMaxCompletionTokens: true },
}

// Helper to get model features based on model ID/name
function getModelFeatures(modelName: string): ModelFeatures {
  // Check for exact matches first
  if (MODEL_FEATURES[modelName]) {
    return MODEL_FEATURES[modelName]
  }

  // Check for partial matches (e.g., if modelName contains a known model ID)
  for (const [key, features] of Object.entries(MODEL_FEATURES)) {
    if (modelName.includes(key)) {
      return features
    }
  }

  // Default features for unknown models
  return { usesMaxCompletionTokens: false }
}

// Apply model-specific parameter transformations based on model features
function applyModelSpecificTransformations(
  opts: OpenAI.ChatCompletionCreateParams,
): void {
  if (!opts.model || typeof opts.model !== 'string') {
    return
  }

  const features = getModelFeatures(opts.model)

  // Apply transformations based on features
  if (
    features.usesMaxCompletionTokens &&
    'max_tokens' in opts &&
    !('max_completion_tokens' in opts)
  ) {
    opts.max_completion_tokens = opts.max_tokens
    delete opts.max_tokens
  }

  // Add more transformations here as needed
}

async function applyModelErrorFixes(
  opts: OpenAI.ChatCompletionCreateParams,
  baseURL: string,
) {
  for (const handler of ERROR_HANDLERS) {
    if (hasModelError(baseURL, opts.model, handler.type)) {
      await handler.fix(opts)
      return
    }
  }
}

// Helper function to try different endpoints for OpenAI-compatible providers
async function tryWithEndpointFallback(
  baseURL: string,
  opts: OpenAI.ChatCompletionCreateParams,
  headers: Record<string, string>,
  provider: string,
  proxy: any,
  signal?: AbortSignal, // 🔧 Add AbortSignal support
): Promise<{ response: Response; endpoint: string }> {
  const endpointsToTry = []

  if (provider === 'minimax') {
    endpointsToTry.push('/text/chatcompletion_v2', '/chat/completions')
  } else {
    endpointsToTry.push('/chat/completions')
  }

  let lastError = null

  for (const endpoint of endpointsToTry) {
    try {
      const response = await fetch(`${baseURL}${endpoint}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(opts.stream ? { ...opts, stream: true } : opts),
        dispatcher: proxy,
        signal: signal, // 🔧 Connect AbortSignal to fetch call
      })

      // If successful, return immediately
      if (response.ok) {
        return { response, endpoint }
      }

      // If it's a 404, try the next endpoint
      if (response.status === 404 && endpointsToTry.length > 1) {
        console.log(
          `Endpoint ${endpoint} returned 404, trying next endpoint...`,
        )
        continue
      }

      // For other error codes, return this response (don't try fallback)
      return { response, endpoint }
    } catch (error) {
      lastError = error
      // Network errors might be temporary, try next endpoint
      if (endpointsToTry.indexOf(endpoint) < endpointsToTry.length - 1) {
        console.log(`Network error on ${endpoint}, trying next endpoint...`)
        continue
      }
    }
  }

  // If we get here, all endpoints failed
  throw lastError || new Error('All endpoints failed')
}

export async function getCompletionWithProfile(
  modelProfile: any,
  opts: OpenAI.ChatCompletionCreateParams,
  attempt: number = 0,
  maxAttempts: number = 10,
  signal?: AbortSignal, // 🔧 CRITICAL FIX: Add AbortSignal support
): Promise<OpenAI.ChatCompletion | AsyncIterable<OpenAI.ChatCompletionChunk>> {
  if (attempt >= maxAttempts) {
    throw new Error('Max attempts reached')
  }

  const provider = modelProfile?.provider || 'anthropic'
  const baseURL = modelProfile?.baseURL
  const apiKey = modelProfile?.apiKey
  const proxy = getGlobalConfig().proxy
    ? new ProxyAgent(getGlobalConfig().proxy)
    : undefined

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (apiKey) {
    if (provider === 'azure') {
      headers['api-key'] = apiKey
    } else {
      headers['Authorization'] = `Bearer ${apiKey}`
    }
  }

  applyModelSpecificTransformations(opts)
  await applyModelErrorFixes(opts, baseURL || '')

  // 🔥 REAL-TIME API CALL DEBUG - 使用全局日志系统
  debugLogger.api('OPENAI_API_CALL_START', {
    endpoint: baseURL || 'DEFAULT_OPENAI',
    model: opts.model,
    provider,
    apiKeyConfigured: !!apiKey,
    apiKeyPrefix: apiKey ? apiKey.substring(0, 8) : null,
    maxTokens: opts.max_tokens,
    temperature: opts.temperature,
    messageCount: opts.messages?.length || 0,
    streamMode: opts.stream,
    timestamp: new Date().toISOString(),
    modelProfileName: modelProfile?.modelName,
    modelProfileName: modelProfile?.name,
  })

  // Make sure all tool messages have string content
  opts.messages = opts.messages.map(msg => {
    if (msg.role === 'tool') {
      if (Array.isArray(msg.content)) {
        return {
          ...msg,
          content:
            msg.content
              .map(c => c.text || '')
              .filter(Boolean)
              .join('\n\n') || '(empty content)',
        }
      } else if (typeof msg.content !== 'string') {
        return {
          ...msg,
          content:
            typeof msg.content === 'undefined'
              ? '(empty content)'
              : JSON.stringify(msg.content),
        }
      }
    }
    return msg
  })

  // Define Azure-specific API endpoint with version
  const azureApiVersion = '2024-06-01'
  let endpoint = '/chat/completions'

  if (provider === 'azure') {
    endpoint = `/chat/completions?api-version=${azureApiVersion}`
  } else if (provider === 'minimax') {
    endpoint = '/text/chatcompletion_v2'
  }

  try {
    if (opts.stream) {
      const isOpenAICompatible = [
        'minimax',
        'kimi',
        'deepseek',
        'siliconflow',
        'qwen',
        'glm',
        'baidu-qianfan',
        'openai',
        'mistral',
        'xai',
        'groq',
        'custom-openai',
      ].includes(provider)

      let response: Response
      let usedEndpoint: string

      if (isOpenAICompatible && provider !== 'azure') {
        const result = await tryWithEndpointFallback(
          baseURL,
          opts,
          headers,
          provider,
          proxy,
          signal, // 🔧 Pass AbortSignal to endpoint fallback
        )
        response = result.response
        usedEndpoint = result.endpoint
      } else {
        response = await fetch(`${baseURL}${endpoint}`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ ...opts, stream: true }),
          dispatcher: proxy,
          signal: signal, // 🔧 CRITICAL FIX: Connect AbortSignal to fetch call
        })
        usedEndpoint = endpoint
      }

      if (!response.ok) {
        // 🔧 CRITICAL FIX: Check abort signal BEFORE showing retry message
        if (signal?.aborted) {
          throw new Error('Request cancelled by user')
        }
        
        const delayMs = getRetryDelay(attempt)
        console.log(
          `  ⎿  API error (${response.status}), retrying in ${Math.round(delayMs / 1000)}s... (attempt ${attempt + 1}/${maxAttempts})`,
        )
        try {
          await abortableDelay(delayMs, signal)
        } catch (error) {
          // If aborted during delay, throw the error to stop retrying
          if (error.message === 'Request was aborted') {
            throw new Error('Request cancelled by user')
          }
          throw error
        }
        return getCompletionWithProfile(
          modelProfile,
          opts,
          attempt + 1,
          maxAttempts,
          signal, // 🔧 Pass AbortSignal to recursive call
        )
      }

      const stream = createStreamProcessor(response.body as any)
      return stream
    }

    // Non-streaming request
    const isOpenAICompatible = [
      'minimax',
      'kimi',
      'deepseek',
      'siliconflow',
      'qwen',
      'glm',
      'baidu-qianfan',
      'openai',
      'mistral',
      'xai',
      'groq',
      'custom-openai',
    ].includes(provider)

    let response: Response
    let usedEndpoint: string

    if (isOpenAICompatible && provider !== 'azure') {
      const result = await tryWithEndpointFallback(
        baseURL,
        opts,
        headers,
        provider,
        proxy,
        signal, // 🔧 Pass AbortSignal to endpoint fallback
      )
      response = result.response
      usedEndpoint = result.endpoint
    } else {
      response = await fetch(`${baseURL}${endpoint}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(opts),
        dispatcher: proxy,
        signal: signal, // 🔧 CRITICAL FIX: Connect AbortSignal to non-streaming fetch call
      })
      usedEndpoint = endpoint
    }

    if (!response.ok) {
      // 🔧 CRITICAL FIX: Check abort signal BEFORE showing retry message
      if (signal?.aborted) {
        throw new Error('Request cancelled by user')
      }
      
      const delayMs = getRetryDelay(attempt)
      console.log(
        `  ⎿  API error (${response.status}), retrying in ${Math.round(delayMs / 1000)}s... (attempt ${attempt + 1}/${maxAttempts})`,
      )
      try {
        await abortableDelay(delayMs, signal)
      } catch (error) {
        // If aborted during delay, throw the error to stop retrying
        if (error.message === 'Request was aborted') {
          throw new Error('Request cancelled by user')
        }
        throw error
      }
      return getCompletionWithProfile(
        modelProfile,
        opts,
        attempt + 1,
        maxAttempts,
        signal, // 🔧 Pass AbortSignal to recursive call
      )
    }

    const responseData = (await response.json()) as OpenAI.ChatCompletion
    return responseData
  } catch (error) {
    // 🔧 CRITICAL FIX: Check abort signal BEFORE showing retry message
    if (signal?.aborted) {
      throw new Error('Request cancelled by user')
    }
    
    if (attempt < maxAttempts) {
      // 🔧 Double-check abort status to avoid showing misleading retry message
      if (signal?.aborted) {
        throw new Error('Request cancelled by user')
      }
      
      const delayMs = getRetryDelay(attempt)
      console.log(
        `  ⎿  Network error, retrying in ${Math.round(delayMs / 1000)}s... (attempt ${attempt + 1}/${maxAttempts})`,
      )
      try {
        await abortableDelay(delayMs, signal)
      } catch (error) {
        // If aborted during delay, throw the error to stop retrying
        if (error.message === 'Request was aborted') {
          throw new Error('Request cancelled by user')
        }
        throw error
      }
      return getCompletionWithProfile(
        modelProfile,
        opts,
        attempt + 1,
        maxAttempts,
        signal, // 🔧 Pass AbortSignal to recursive call
      )
    }
    throw error
  }
}

export function createStreamProcessor(
  stream: any,
): AsyncGenerator<OpenAI.ChatCompletionChunk, void, unknown> {
  if (!stream) {
    throw new Error('Stream is null or undefined')
  }

  return (async function* () {
    const reader = stream.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''

    try {
      while (true) {
        let readResult
        try {
          readResult = await reader.read()
        } catch (e) {
          console.error('Error reading from stream:', e)
          break
        }

        const { done, value } = readResult
        if (done) {
          break
        }

        const chunk = decoder.decode(value, { stream: true })
        buffer += chunk

        let lineEnd = buffer.indexOf('\n')
        while (lineEnd !== -1) {
          const line = buffer.substring(0, lineEnd).trim()
          buffer = buffer.substring(lineEnd + 1)

          if (line === 'data: [DONE]') {
            continue
          }

          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim()
            if (!data) continue

            try {
              const parsed = JSON.parse(data) as OpenAI.ChatCompletionChunk
              yield parsed
            } catch (e) {
              console.error('Error parsing JSON:', data, e)
            }
          }

          lineEnd = buffer.indexOf('\n')
        }
      }

      // Process any remaining data in the buffer
      if (buffer.trim()) {
        const lines = buffer.trim().split('\n')
        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            const data = line.slice(6).trim()
            if (!data) continue

            try {
              const parsed = JSON.parse(data) as OpenAI.ChatCompletionChunk
              yield parsed
            } catch (e) {
              console.error('Error parsing final JSON:', data, e)
            }
          }
        }
      }
    } catch (e) {
      console.error('Unexpected error in stream processing:', e)
    } finally {
      try {
        reader.releaseLock()
      } catch (e) {
        console.error('Error releasing reader lock:', e)
      }
    }
  })()
}

export function streamCompletion(
  stream: any,
): AsyncGenerator<OpenAI.ChatCompletionChunk, void, unknown> {
  return createStreamProcessor(stream)
}

/**
 * Fetch available models from custom OpenAI-compatible API
 */
export async function fetchCustomModels(
  baseURL: string,
  apiKey: string,
): Promise<any[]> {
  try {
    // Check if baseURL already contains version number (e.g., v1, v2, etc.)
    const hasVersionNumber = /\/v\d+/.test(baseURL)
    const cleanBaseURL = baseURL.replace(/\/+$/, '')
    const modelsURL = hasVersionNumber
      ? `${cleanBaseURL}/models`
      : `${cleanBaseURL}/v1/models`

    const response = await fetch(modelsURL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      // Provide user-friendly error messages based on status code
      if (response.status === 401) {
        throw new Error(
          'Invalid API key. Please check your API key and try again.',
        )
      } else if (response.status === 403) {
        throw new Error(
          'API key does not have permission to access models. Please check your API key permissions.',
        )
      } else if (response.status === 404) {
        throw new Error(
          'API endpoint not found. Please check if the base URL is correct and supports the /models endpoint.',
        )
      } else if (response.status === 429) {
        throw new Error(
          'Too many requests. Please wait a moment and try again.',
        )
      } else if (response.status >= 500) {
        throw new Error(
          'API service is temporarily unavailable. Please try again later.',
        )
      } else {
        throw new Error(
          `Unable to connect to API (${response.status}). Please check your base URL, API key, and internet connection.`,
        )
      }
    }

    const data = await response.json()

    // Validate response format and extract models array
    let models = []

    if (data && data.data && Array.isArray(data.data)) {
      // Standard OpenAI format: { data: [...] }
      models = data.data
    } else if (Array.isArray(data)) {
      // Direct array format
      models = data
    } else if (data && data.models && Array.isArray(data.models)) {
      // Alternative format: { models: [...] }
      models = data.models
    } else {
      throw new Error(
        'API returned unexpected response format. Expected an array of models or an object with a "data" or "models" array.',
      )
    }

    // Ensure we have an array and validate it contains model objects
    if (!Array.isArray(models)) {
      throw new Error('API response format error: models data is not an array.')
    }

    return models
  } catch (error) {
    // If it's already our custom error, pass it through
    if (
      error instanceof Error &&
      (error.message.includes('API key') ||
        error.message.includes('API endpoint') ||
        error.message.includes('API service') ||
        error.message.includes('response format'))
    ) {
      throw error
    }

    // For network errors or other issues
    console.error('Failed to fetch custom API models:', error)

    // Check if it's a network error
    if (error instanceof Error && error.message.includes('fetch')) {
      throw new Error(
        'Unable to connect to the API. Please check the base URL and your internet connection.',
      )
    }

    throw new Error(
      'Failed to fetch models from custom API. Please check your configuration and try again.',
    )
  }
}
