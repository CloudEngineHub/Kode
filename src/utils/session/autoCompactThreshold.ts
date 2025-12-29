export const AUTO_COMPACT_THRESHOLD_RATIO = 0.9

export function calculateAutoCompactThresholds(
  tokenCount: number,
  contextLimit: number,
  ratio: number = AUTO_COMPACT_THRESHOLD_RATIO,
): {
  isAboveAutoCompactThreshold: boolean
  percentUsed: number
  tokensRemaining: number
  contextLimit: number
  autoCompactThreshold: number
  ratio: number
} {
  const safeContextLimit =
    Number.isFinite(contextLimit) && contextLimit > 0 ? contextLimit : 1
  const autoCompactThreshold = safeContextLimit * ratio

  return {
    isAboveAutoCompactThreshold: tokenCount >= autoCompactThreshold,
    percentUsed: Math.round((tokenCount / safeContextLimit) * 100),
    tokensRemaining: Math.max(0, autoCompactThreshold - tokenCount),
    contextLimit: safeContextLimit,
    autoCompactThreshold,
    ratio,
  }
}
