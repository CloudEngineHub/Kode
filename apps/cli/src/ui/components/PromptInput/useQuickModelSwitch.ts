import { useCallback, useEffect, useRef } from 'react'
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
  const {
    messages,
    onModelChange,
    onSubmitCountChange,
    setModelSwitchMessage,
  } = args
  const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearDismissTimeout = useCallback(() => {
    if (!dismissTimeoutRef.current) return
    clearTimeout(dismissTimeoutRef.current)
    dismissTimeoutRef.current = null
  }, [])

  const showTimedModelSwitchMessage = useCallback(
    (message: InlineMessageState, delayMs: number) => {
      clearDismissTimeout()
      setModelSwitchMessage(message)
      dismissTimeoutRef.current = setTimeout(() => {
        dismissTimeoutRef.current = null
        setModelSwitchMessage({ show: false })
      }, delayMs)
    },
    [clearDismissTimeout, setModelSwitchMessage],
  )

  useEffect(() => {
    return () => clearDismissTimeout()
  }, [clearDismissTimeout])

  return useCallback(() => {
    const modelManager = getModelManager()
    const currentTokens = estimateTokens(messages)
    const debugInfo = modelManager.getModelSwitchingDebugInfo()
    const switchResult = modelManager.switchToNextModel(currentTokens)

    if (switchResult.success && switchResult.modelName) {
      onModelChange?.()
      onSubmitCountChange(prev => prev + 1)
      showTimedModelSwitchMessage(
        {
          show: true,
          text: switchResult.message || `Switched to ${switchResult.modelName}`,
        },
        3000,
      )
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

    showTimedModelSwitchMessage({ show: true, text: errorMessage }, 6000)
  }, [messages, onModelChange, onSubmitCountChange, showTimedModelSwitchMessage])
}
