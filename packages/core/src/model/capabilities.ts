import type { ModelProfile } from '#config'

import type { ContextCompatibility } from './types'

export function getVertexRegionForModel(
  model: string | undefined,
): string | undefined {
  if (model?.startsWith('claude-3-5-haiku')) {
    return process.env.VERTEX_REGION_CLAUDE_3_5_HAIKU
  }
  if (model?.startsWith('claude-3-5-sonnet')) {
    return process.env.VERTEX_REGION_CLAUDE_3_5_SONNET
  }
  if (model?.startsWith('claude-3-7-sonnet')) {
    return process.env.VERTEX_REGION_CLAUDE_3_7_SONNET
  }
}

export function analyzeContextCompatibility(
  model: ModelProfile,
  contextTokens: number,
): ContextCompatibility {
  const usableContext = Math.floor(model.contextLength * 0.8)
  const usagePercentage = (contextTokens / usableContext) * 100

  if (usagePercentage <= 70) {
    return {
      compatible: true,
      severity: 'safe',
      usagePercentage,
      recommendation: 'Full context preserved',
    }
  }

  if (usagePercentage <= 90) {
    return {
      compatible: true,
      severity: 'warning',
      usagePercentage,
      recommendation: 'Context usage high, consider compression',
    }
  }

  return {
    compatible: false,
    severity: 'critical',
    usagePercentage,
    recommendation: 'Auto-compression or message truncation required',
  }
}

export function canModelHandleContext(
  model: ModelProfile,
  contextTokens: number,
): boolean {
  const analysis = analyzeContextCompatibility(model, contextTokens)
  return analysis.compatible
}

export function findModelWithSufficientContext(
  models: ModelProfile[],
  contextTokens: number,
): ModelProfile | null {
  return (
    models.find(model => canModelHandleContext(model, contextTokens)) || null
  )
}
