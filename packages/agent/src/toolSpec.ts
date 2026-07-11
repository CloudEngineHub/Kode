export type ParsedToolSpec = {
  name: string
  commandAllowedRule?: string
}

/**
 * Parses the agent tool allow/deny syntax shared by persisted Agent settings
 * and TaskTool execution. A rule may be either `Tool` or `Tool(rule)`.
 */
export function parseToolSpec(spec: string): ParsedToolSpec {
  const trimmed = spec.trim()
  if (!trimmed) {
    throw new Error('Agent tool specs cannot be empty.')
  }

  if (!trimmed.includes('(') && !trimmed.includes(')')) {
    return { name: trimmed }
  }

  const match = trimmed.match(/^([^()]+)\(([^()]+)\)$/)
  if (!match) {
    throw new Error(
      `Invalid agent tool spec '${trimmed}'. Expected a tool name or Tool(rule).`,
    )
  }

  const toolName = match[1]?.trim()
  const ruleContent = match[2]?.trim()
  if (!toolName || !ruleContent) {
    throw new Error(
      `Invalid agent tool spec '${trimmed}'. Tool name and rule must be non-empty.`,
    )
  }

  return {
    name: toolName,
    commandAllowedRule: `${toolName}(${ruleContent})`,
  }
}

export function getToolNameFromSpec(spec: string): string {
  return parseToolSpec(spec).name
}
