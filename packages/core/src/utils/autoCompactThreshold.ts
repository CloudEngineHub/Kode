import { LEGACY_ENV } from '#config/compat/legacyEnv'

/**
 * Reserved budget for non-message overhead (system prompt, tool schemas, etc.).
 *
 * Kode estimates this as a small percentage of the model context window with a cap.
 */
export const CONTEXT_RESERVE_RATIO = 0.1
export const CONTEXT_RESERVE_CAP_TOKENS = 20_000

/**
 * Fixed-margin thresholds:
 * - Auto-compact happens when you're within a fixed token margin of the effective
 *   context limit (after reserving overhead).
 * - Warnings happen when you're within a fixed margin of the auto-compact boundary.
 */
export const AUTO_COMPACT_MARGIN_TOKENS = 13_000
export const WARNING_MARGIN_TOKENS = 20_000
export const ERROR_MARGIN_TOKENS = 20_000

function parseAutoCompactPctOverride(): number | null {
  const raw =
    process.env.KODE_AUTOCOMPACT_PCT_OVERRIDE ??
    process.env[LEGACY_ENV.autoCompactPctOverride]
  if (!raw) return null
  const parsed = Number.parseFloat(raw)
  if (!Number.isFinite(parsed)) return null
  if (parsed <= 0 || parsed > 100) return null
  return parsed
}

export function getEffectiveConversationContextLimit(
  contextLimit: number,
  options?: {
    reserveRatio?: number
    reserveCapTokens?: number
  },
): number {
  const safeContextLimit =
    Number.isFinite(contextLimit) && contextLimit > 0 ? contextLimit : 1

  const reserveRatioRaw = options?.reserveRatio ?? CONTEXT_RESERVE_RATIO
  const reserveRatio =
    Number.isFinite(reserveRatioRaw) && reserveRatioRaw > 0
      ? Math.min(0.5, reserveRatioRaw)
      : 0
  const reserveCapTokensRaw =
    options?.reserveCapTokens ?? CONTEXT_RESERVE_CAP_TOKENS
  const reserveCapTokens =
    Number.isFinite(reserveCapTokensRaw) && reserveCapTokensRaw > 0
      ? Math.trunc(reserveCapTokensRaw)
      : 0

  const reserved = Math.min(
    reserveCapTokens,
    Math.max(0, Math.floor(safeContextLimit * reserveRatio)),
  )
  return Math.max(1, safeContextLimit - reserved)
}

export function calculateAutoCompactThresholds(
  tokenCount: number,
  contextLimit: number,
): {
  isAboveAutoCompactThreshold: boolean
  percentUsed: number
  tokensRemaining: number
  contextLimit: number
  autoCompactThreshold: number
} {
  const safeContextLimit =
    Number.isFinite(contextLimit) && contextLimit > 0 ? contextLimit : 1

  const baseThreshold = Math.max(
    1,
    safeContextLimit - AUTO_COMPACT_MARGIN_TOKENS,
  )

  const pctOverride = parseAutoCompactPctOverride()
  const percentThreshold =
    pctOverride === null
      ? null
      : Math.max(1, Math.floor(safeContextLimit * (pctOverride / 100)))

  const autoCompactThreshold =
    percentThreshold === null
      ? baseThreshold
      : Math.min(baseThreshold, percentThreshold)

  return {
    isAboveAutoCompactThreshold: tokenCount >= autoCompactThreshold,
    percentUsed: Math.round((tokenCount / safeContextLimit) * 100),
    tokensRemaining: Math.max(0, autoCompactThreshold - tokenCount),
    contextLimit: safeContextLimit,
    autoCompactThreshold,
  }
}
