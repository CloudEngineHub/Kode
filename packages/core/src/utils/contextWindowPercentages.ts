export type ContextWindowUsage = {
  input_tokens: number
  output_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

export function computeContextWindowPercentages(args: {
  currentUsage: ContextWindowUsage | null | undefined
  contextWindowSize: number | null | undefined
}): {
  used_percentage: number | null
  remaining_percentage: number | null
} {
  const currentUsage = args.currentUsage ?? null
  const contextWindowSize = args.contextWindowSize ?? null

  if (!currentUsage || !contextWindowSize || contextWindowSize <= 0) {
    return { used_percentage: null, remaining_percentage: null }
  }

  const usedTokens =
    currentUsage.input_tokens +
    (currentUsage.cache_creation_input_tokens ?? 0) +
    (currentUsage.cache_read_input_tokens ?? 0)

  const raw = Math.round((usedTokens / contextWindowSize) * 100)
  const used = Math.min(100, Math.max(0, raw))
  return { used_percentage: used, remaining_percentage: 100 - used }
}
