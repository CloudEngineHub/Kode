import models from '#core/constants/models'

export function getModelInputTokenCostUSD(model: string): number {
  // Find the model in the models object
  for (const providerModels of Object.values(models)) {
    const modelInfo = providerModels.find((m: any) => m.model === model)
    if (modelInfo) {
      return modelInfo.input_cost_per_token || 0
    }
  }
  // Default fallback cost for unknown models
  return 0.000003 // Default to Claude 3 Haiku cost
}

export function getModelOutputTokenCostUSD(model: string): number {
  // Find the model in the models object
  for (const providerModels of Object.values(models)) {
    const modelInfo = providerModels.find((m: any) => m.model === model)
    if (modelInfo) {
      return modelInfo.output_cost_per_token || 0
    }
  }
  // Default fallback cost for unknown models
  return 0.000015 // Default to Claude 3 Haiku cost
}
