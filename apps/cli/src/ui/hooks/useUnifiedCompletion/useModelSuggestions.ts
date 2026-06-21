import { useEffect, useState } from 'react'

import { debug as debugLogger } from '#core/utils/debugLogger'
import { logError } from '#core/utils/log'
import { getModelManager } from '#core/utils/model'
import type { UnifiedSuggestion } from '#cli-utils/completion/types'

export function useModelSuggestions(): UnifiedSuggestion[] {
  const [modelSuggestions, setModelSuggestions] = useState<UnifiedSuggestion[]>(
    [],
  )

  useEffect(() => {
    try {
      const modelManager = getModelManager()
      const allModels = modelManager.getAllAvailableModelNames()

      const suggestions: UnifiedSuggestion[] = allModels.map(modelId => ({
        value: `ask-${modelId}`,
        displayValue: `🦜 ask-${modelId} :: Consult ${modelId} for expert opinion and specialized analysis`,
        type: 'ask',
        score: 90,
        metadata: { modelId },
      }))

      setModelSuggestions(suggestions)
    } catch (error) {
      logError(error)
      debugLogger.warn('UNIFIED_COMPLETION_MODELS_LOAD_FAILED', {
        error: error instanceof Error ? error.message : String(error),
      })
      setModelSuggestions([])
    }
  }, [])

  return modelSuggestions
}
