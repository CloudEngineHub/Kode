import { useCallback } from 'react'
import { estimateTokens } from '#core/utils/tokens'
import { getModelManager } from '#core/utils/model'
import type { Message } from '#core/query'

type InlineMessageState = { show: boolean; text?: string }

export function useQuickModelSwitch(args: {
  messages: Message[]
  onSubmitCountChange: (updater: (prev: number) => number) => void
  setModelSwitchMessage: (message: InlineMessageState) => void
  onModelChange?: () => void
}) {
  return useCallback(() => {
    const modelManager = getModelManager()
    const currentTokens = estimateTokens(args.messages)
    const debugInfo = modelManager.getModelSwitchingDebugInfo()
    const switchResult = modelManager.switchToNextModel(currentTokens)

    if (switchResult.success && switchResult.modelName) {
      args.onModelChange?.()
      args.onSubmitCountChange(prev => prev + 1)
      args.setModelSwitchMessage({
        show: true,
        text: switchResult.message || `Switched to ${switchResult.modelName}`,
      })
      setTimeout(() => args.setModelSwitchMessage({ show: false }), 3000)
      return
    }

    let errorMessage = switchResult.message
    if (!errorMessage) {
      if (debugInfo.totalModels === 0) {
        errorMessage = 'No models configured. Use /model to add models.'
      } else if (debugInfo.activeModels === 0) {
        errorMessage = `No active models (${debugInfo.totalModels} total, all inactive). Use /model to activate models.`
      } else if (debugInfo.activeModels === 1) {
        const allModelNames = debugInfo.availableModels
          .map(m => `${m.name}${m.isActive ? '' : ' (inactive)'}`)
          .join(', ')
        errorMessage = `Only 1 active model out of ${debugInfo.totalModels} total models: ${allModelNames}. All configured models will be activated for switching.`
      } else {
        errorMessage = `Model switching failed (${debugInfo.activeModels} active, ${debugInfo.totalModels} total models available)`
      }
    }

    args.setModelSwitchMessage({ show: true, text: errorMessage })
    setTimeout(() => args.setModelSwitchMessage({ show: false }), 6000)
  }, [args])
}
