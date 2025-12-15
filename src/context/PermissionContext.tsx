import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from 'react'
import {
  PermissionMode,
  PermissionContext as IPermissionContext,
  getNextPermissionMode,
  MODE_CONFIGS,
} from '@kode-types/PermissionMode'
import {
  getPermissionModeForConversationKey,
  setPermissionModeForConversationKey,
} from '@utils/permissionModeState'
import {
  enterPlanModeForConversationKey,
  exitPlanModeForConversationKey,
  setActivePlanConversationKey,
} from '@utils/planMode'

interface PermissionContextValue {
  permissionContext: IPermissionContext
  currentMode: PermissionMode
  conversationKey: string
  cycleMode: () => void
  setMode: (mode: PermissionMode) => void
  isToolAllowed: (toolName: string) => boolean
  getModeConfig: () => (typeof MODE_CONFIGS)[PermissionMode]
}

const PermissionContext = createContext<PermissionContextValue | undefined>(
  undefined,
)

interface PermissionProviderProps {
  children?: ReactNode
  conversationKey: string
  isBypassPermissionsModeAvailable?: boolean
}

export function PermissionProvider({
  children,
  conversationKey,
  isBypassPermissionsModeAvailable = false,
}: PermissionProviderProps) {
  const [permissionContext, setPermissionContext] = useState<IPermissionContext>(() => {
    const initialMode = getPermissionModeForConversationKey({
      conversationKey,
      isBypassPermissionsModeAvailable,
    })
    const initialConfig = MODE_CONFIGS[initialMode]
    return {
      mode: initialMode,
      allowedTools: initialConfig.allowedTools,
      allowedPaths: [process.cwd()],
      restrictions: initialConfig.restrictions,
      metadata: {
        transitionCount: 0,
      },
    }
  })

  useEffect(() => {
    const mode = getPermissionModeForConversationKey({
      conversationKey,
      isBypassPermissionsModeAvailable,
    })
    const config = MODE_CONFIGS[mode]
    setPermissionContext({
      mode,
      allowedTools: config.allowedTools,
      allowedPaths: [process.cwd()],
      restrictions: config.restrictions,
      metadata: {
        transitionCount: 0,
      },
    })
  }, [conversationKey, isBypassPermissionsModeAvailable])

  useEffect(() => {
    setActivePlanConversationKey(conversationKey)
    if (permissionContext.mode === 'plan') {
      enterPlanModeForConversationKey(conversationKey)
    }
  }, [conversationKey, permissionContext.mode])

  const cycleMode = useCallback(() => {
    setPermissionContext(prev => {
      const nextMode = getNextPermissionMode(
        prev.mode,
        isBypassPermissionsModeAvailable,
      )
      const modeConfig = MODE_CONFIGS[nextMode]

      setPermissionModeForConversationKey({ conversationKey, mode: nextMode })
      if (prev.mode !== 'plan' && nextMode === 'plan') {
        enterPlanModeForConversationKey(conversationKey)
      } else if (prev.mode === 'plan' && nextMode !== 'plan') {
        exitPlanModeForConversationKey(conversationKey)
      }

      return {
        ...prev,
        mode: nextMode,
        allowedTools: modeConfig.allowedTools,
        restrictions: modeConfig.restrictions,
        metadata: {
          ...prev.metadata,
          previousMode: prev.mode,
          activatedAt: new Date().toISOString(),
          transitionCount: prev.metadata.transitionCount + 1,
        },
      }
    })
  }, [conversationKey, isBypassPermissionsModeAvailable])

  const setMode = useCallback((mode: PermissionMode) => {
    setPermissionContext(prev => {
      const modeConfig = MODE_CONFIGS[mode]
      setPermissionModeForConversationKey({ conversationKey, mode })
      if (prev.mode !== 'plan' && mode === 'plan') {
        enterPlanModeForConversationKey(conversationKey)
      } else if (prev.mode === 'plan' && mode !== 'plan') {
        exitPlanModeForConversationKey(conversationKey)
      }

      return {
        ...prev,
        mode,
        allowedTools: modeConfig.allowedTools,
        restrictions: modeConfig.restrictions,
        metadata: {
          ...prev.metadata,
          previousMode: prev.mode,
          activatedAt: new Date().toISOString(),
          transitionCount: prev.metadata.transitionCount + 1,
        },
      }
    })
  }, [conversationKey])

  const isToolAllowed = useCallback(
    (toolName: string) => {
      const { allowedTools } = permissionContext

      // If '*' is in allowed tools, all tools are allowed
      if (allowedTools.includes('*')) {
        return true
      }

      // Check if specific tool is in allowed list
      return allowedTools.includes(toolName)
    },
    [permissionContext],
  )

  const getModeConfig = useCallback(() => {
    return MODE_CONFIGS[permissionContext.mode]
  }, [permissionContext.mode])

  const value: PermissionContextValue = {
    permissionContext,
    currentMode: permissionContext.mode,
    conversationKey,
    cycleMode,
    setMode,
    isToolAllowed,
    getModeConfig,
  }

  return (
    <PermissionContext.Provider value={value}>
      {children}
    </PermissionContext.Provider>
  )
}

export function usePermissionContext(): PermissionContextValue {
  const context = useContext(PermissionContext)
  if (context === undefined) {
    throw new Error(
      'usePermissionContext must be used within a PermissionProvider',
    )
  }
  return context
}

// Hook for components that need to respond to permission mode changes
export function usePermissionMode(): [
  PermissionMode,
  (mode: PermissionMode) => void,
  () => void,
] {
  const { currentMode, setMode, cycleMode } = usePermissionContext()
  return [currentMode, setMode, cycleMode]
}
