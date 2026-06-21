export function getToolNameFromSpec(spec: string): string {
  const trimmed = spec.trim()
  if (!trimmed) return trimmed
  const match = trimmed.match(/^([^(]+)\(([^)]+)\)$/)
  if (!match) return trimmed
  const toolName = match[1]?.trim()
  const ruleContent = match[2]?.trim()
  if (!toolName || !ruleContent) return trimmed
  return toolName
}
