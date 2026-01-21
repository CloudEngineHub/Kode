import { DEFAULT_MAX_TOKENS } from './flow/options'
import type { ModelInfo } from './flow/types'
import { logError } from '#core/utils/log'

type JsonObject = Record<string, unknown>

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getNestedValue(value: unknown, path: string[]): unknown {
  let current: unknown = value
  for (const key of path) {
    if (!isRecord(current)) return undefined
    current = current[key]
  }
  return current
}

function toPositiveFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null
}

export async function fetchOllamaModels(args: {
  ollamaBaseUrl: string
  setAvailableModels: (models: ModelInfo[]) => void
  setModelLoadError: (error: string | null) => void
  navigateTo: (screen: 'model') => void
}): Promise<ModelInfo[]> {
  try {
    const response = await fetch(`${args.ollamaBaseUrl}/models`)

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`)
    }

    const responseData = await response.json()

    let models: unknown[] = []

    if (isRecord(responseData) && Array.isArray(responseData.data)) {
      models = responseData.data
    } else if (isRecord(responseData) && Array.isArray(responseData.models)) {
      models = responseData.models
    } else if (Array.isArray(responseData)) {
      models = responseData
    } else {
      throw new Error('Invalid response from Ollama API: missing models array')
    }

    const getModelName = (model: unknown): string => {
      if (typeof model === 'string') return model
      if (!isRecord(model)) return ''

      const candidates = [
        model.id,
        model.name,
        model.modelName,
        model.model,
        model.model_name,
      ]
      for (const c of candidates) {
        if (typeof c === 'string') return c
      }
      return ''
    }

    const ollamaModels: ModelInfo[] = models.map(model => ({
      model: getModelName(model),
      provider: 'ollama',
      max_tokens: DEFAULT_MAX_TOKENS,
      supports_vision: false,
      supports_function_calling: true,
      supports_reasoning_effort: false,
    }))

    const validModels = ollamaModels.filter(model => model.model)

    const normalizeOllamaRoot = (url: string): string => {
      try {
        const u = new URL(url)
        let pathname = u.pathname.replace(/\/+$/g, '').replace(/^$/, '')
        if (pathname.endsWith('/v1')) {
          pathname = pathname.slice(0, -3)
        }
        u.pathname = pathname
        return u.toString().replace(/\/+$/g, '')
      } catch {
        return url.replace(/\/v1\/?$/g, '')
      }
    }

    const extractContextTokens = (data: unknown): number | null => {
      if (!isRecord(data)) return null

      const modelInfoValue = data.model_info
      if (isRecord(modelInfoValue)) {
        for (const key of Object.keys(modelInfoValue)) {
          if (
            key.endsWith('.context_length') ||
            key.endsWith('_context_length')
          ) {
            const val = toPositiveFiniteNumber(modelInfoValue[key])
            if (val) return val
          }
        }
      }

      const paths: string[][] = [
        ['parameters', 'num_ctx'],
        ['model_info', 'num_ctx'],
        ['config', 'num_ctx'],
        ['details', 'context_length'],
        ['context_length'],
        ['num_ctx'],
        ['max_tokens'],
        ['max_new_tokens'],
      ]

      const candidates = paths
        .map(path => toPositiveFiniteNumber(getNestedValue(data, path)))
        .filter((v): v is number => typeof v === 'number')

      if (candidates.length > 0) return Math.max(...candidates)

      const parametersValue = getNestedValue(data, ['parameters'])
      if (typeof parametersValue === 'string') {
        const m = parametersValue.match(/num_ctx\s*[:=]\s*(\d+)/i)
        if (!m) return null
        const n = parseInt(m[1], 10)
        return Number.isFinite(n) && n > 0 ? n : null
      }
      return null
    }

    const ollamaRoot = normalizeOllamaRoot(args.ollamaBaseUrl)
    const enrichedModels = await Promise.all(
      validModels.map(async m => {
        try {
          const showResp = await fetch(`${ollamaRoot}/api/show`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: m.model }),
          })
          if (showResp.ok) {
            const showData = await showResp.json()
            const ctx = extractContextTokens(showData)
            if (typeof ctx === 'number' && isFinite(ctx) && ctx > 0) {
              return { ...m, context_length: ctx }
            }
          }
          return m
        } catch {
          return m
        }
      }),
    )

    args.setAvailableModels(enrichedModels)

    if (enrichedModels.length > 0) {
      args.navigateTo('model')
    } else {
      args.setModelLoadError('No models found in your Ollama installation')
    }

    return enrichedModels
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    if (errorMessage.includes('fetch')) {
      args.setModelLoadError(
        `Could not connect to Ollama server at ${args.ollamaBaseUrl}. Make sure Ollama is running and the URL is correct.`,
      )
    } else {
      args.setModelLoadError(`Error loading Ollama models: ${errorMessage}`)
    }

    logError(error)
    return []
  }
}
