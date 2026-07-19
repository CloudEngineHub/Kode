export const MIN_RENDERABLE_CONTEXT_LIMIT = 8_000

export function formatTokenCount(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens <= 0) return '0'
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`
  return `${Math.round(tokens)}`
}

export function isRenderableContextLimit(
  contextLimit: number | undefined,
): contextLimit is number {
  return (
    typeof contextLimit === 'number' &&
    Number.isFinite(contextLimit) &&
    contextLimit >= MIN_RENDERABLE_CONTEXT_LIMIT
  )
}

export function formatContextLimit(
  contextLimit: number | undefined,
): string | null {
  return isRenderableContextLimit(contextLimit)
    ? formatTokenCount(contextLimit)
    : null
}
