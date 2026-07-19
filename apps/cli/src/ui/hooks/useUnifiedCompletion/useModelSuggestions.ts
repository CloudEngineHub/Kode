import { useEffect, useState } from 'react'

import { debug as debugLogger } from '#core/utils/debugLogger'
import { logError } from '#core/utils/log'
import { getModelManager } from '#core/utils/model'
import type { UnifiedSuggestion } from '#cli-utils/completion/types'

type ModelSuggestionsArgs = {
  enabled: boolean
  reloadKey?: number
  getModelNames?: () => string[]
}

export function __buildModelSuggestionsForTests(
  modelIds: string[],
): UnifiedSuggestion[] {
  return modelIds.map(modelId => ({
    value: `ask-${modelId}`,
    displayValue: `ask-${modelId} :: Consult ${modelId} for expert opinion and specialized analysis`,
    type: 'ask',
    score: 90,
    metadata: { modelId },
  }))
}

export function useModelSuggestions(args: ModelSuggestionsArgs): {
  suggestions: UnifiedSuggestion[]
  isLoading: boolean
} {
  const { enabled, getModelNames, reloadKey = 0 } = args
  const [modelSuggestions, setModelSuggestions] = useState<UnifiedSuggestion[]>(
    [],
  )
  const [loadedKey, setLoadedKey] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const hasLoaded = loadedKey === reloadKey

  useEffect(() => {
    if (!enabled || hasLoaded || isLoading) return

    setIsLoading(true)
    try {
      const allModels =
        getModelNames?.() ?? getModelManager().getAllAvailableModelNames()
      const suggestions = __buildModelSuggestionsForTests(allModels)

      setModelSuggestions(suggestions)
    } catch (error) {
      logError(error)
      debugLogger.warn('UNIFIED_COMPLETION_MODELS_LOAD_FAILED', {
        error: error instanceof Error ? error.message : String(error),
      })
      setModelSuggestions([])
    } finally {
      setLoadedKey(reloadKey)
      setIsLoading(false)
    }
  }, [enabled, getModelNames, hasLoaded, isLoading, reloadKey])

  if (!enabled) {
    return { suggestions: [], isLoading: false }
  }

  return {
    suggestions: modelSuggestions,
    isLoading: !hasLoaded || isLoading,
  }
}
