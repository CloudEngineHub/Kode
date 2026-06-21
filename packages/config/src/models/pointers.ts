import { getGlobalConfig, saveGlobalConfig } from '../loader'
import type { ModelPointerType } from '../schema'

import type { ModelProfile } from '../schema'
import { validateAndRepairGPT5Profile } from './gpt5'

export function setAllPointersToModel(modelName: string): void {
  const config = getGlobalConfig()
  const updatedConfig = {
    ...config,
    modelPointers: {
      main: modelName,
      task: modelName,
      compact: modelName,
      quick: modelName,
    },
    defaultModelName: modelName,
  }
  saveGlobalConfig(updatedConfig)
}

export function setModelPointer(
  pointer: ModelPointerType,
  modelName: string,
): void {
  const config = getGlobalConfig()
  const updatedConfig = {
    ...config,
    modelPointers: {
      ...config.modelPointers,
      [pointer]: modelName,
    },
  }
  saveGlobalConfig(updatedConfig)
}

export function validateAndRepairAllGPT5Profiles(): {
  repaired: number
  total: number
} {
  const config = getGlobalConfig()
  if (!config.modelProfiles) return { repaired: 0, total: 0 }

  let repairCount = 0
  const repairedProfiles: ModelProfile[] = config.modelProfiles.map(profile => {
    const repaired = validateAndRepairGPT5Profile(profile)
    if (repaired.validationStatus === 'auto_repaired') repairCount++
    return repaired
  })

  if (repairCount > 0) {
    saveGlobalConfig({ ...config, modelProfiles: repairedProfiles })
  }

  return { repaired: repairCount, total: config.modelProfiles.length }
}
