const AGENT_COLOR_ALIASES: Record<string, string> = {
  red: '#ef4444',
  blue: '#3b82f6',
  green: '#22c55e',
  yellow: '#eab308',
  purple: '#a855f7',
  orange: '#f97316',
  pink: '#ec4899',
  cyan: '#06b6d4',
}

/**
 * Converts the friendly agent color names accepted by the agent editor into
 * Ink/Chalk-compatible terminal colors. Keep explicit hex/rgb/ANSI colors
 * intact so existing hand-authored agent files remain compatible.
 */
export function resolveAgentColor(color: unknown): string | undefined {
  if (typeof color !== 'string') return undefined

  const trimmed = color.trim()
  if (!trimmed || trimmed.toLowerCase() === 'automatic') return undefined

  return AGENT_COLOR_ALIASES[trimmed.toLowerCase()] ?? trimmed
}
