import { memoize } from 'lodash-es'

import {
  DEFAULT_GLOBAL_CONFIG,
  getGlobalConfig,
  type GlobalConfig,
  type ModelPointers,
} from '#config'
import { debug as debugLogger } from '#core/logging'
import { logError } from '#core/utils/log'

import { getModelConfig } from './defaults'
import { USE_BEDROCK, USE_VERTEX } from './flags'
import { ModelManager } from './manager'

const DEFAULT_MODEL_POINTERS: ModelPointers = {
  main: '',
  task: '',
  compact: '',
  quick: '',
}

export const getSlowAndCapableModel = memoize(async (): Promise<string> => {
  const config = await getGlobalConfig()
  const modelManager = new ModelManager(config)
  const model = modelManager.getMainAgentModel()

  if (model) return model

  const modelConfig = await getModelConfig()
  if (USE_BEDROCK) return modelConfig.bedrock
  if (USE_VERTEX) return modelConfig.vertex
  return modelConfig.firstParty
})

export async function isDefaultSlowAndCapableModel(): Promise<boolean> {
  return (
    !process.env.ANTHROPIC_MODEL ||
    process.env.ANTHROPIC_MODEL === (await getSlowAndCapableModel())
  )
}

let globalModelManager: ModelManager | null = null

export const getModelManager = (): ModelManager => {
  try {
    if (!globalModelManager) {
      const config = getGlobalConfig()
      if (!config) {
        debugLogger.warn('MODEL_MANAGER_GLOBAL_CONFIG_MISSING', {})
        globalModelManager = new ModelManager({
          ...DEFAULT_GLOBAL_CONFIG,
          modelProfiles: [],
          modelPointers: { ...DEFAULT_MODEL_POINTERS },
        })
      } else {
        globalModelManager = new ModelManager(config)
      }
    }
    return globalModelManager
  } catch (error) {
    logError(error)
    debugLogger.error('MODEL_MANAGER_CREATE_FAILED', {
      error: error instanceof Error ? error.message : String(error),
    })
    return new ModelManager({
      ...(DEFAULT_GLOBAL_CONFIG as GlobalConfig),
      modelProfiles: [],
      modelPointers: { ...DEFAULT_MODEL_POINTERS },
    })
  }
}

export const reloadModelManager = (): void => {
  globalModelManager = null
  getModelManager()
}

export const getQuickModel = (): string => {
  const manager = getModelManager()
  const quickModel = manager.getModel('quick')
  return quickModel?.modelName || 'quick'
}
