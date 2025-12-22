export type ToolNameAliasResolution = {
  originalName: string
  resolvedName: string
  wasAliased: boolean
}

/**
 * Resolve reference CLI tool aliases to their canonical tool names.
 *
 * The reference CLI v2.0.75 unifies AgentOutputTool and BashOutputTool into TaskOutput
 * (with aliases). Kode keeps backward compatibility by resolving the alias names.
 */
export function resolveToolNameAlias(name: string): ToolNameAliasResolution {
  const originalName = name

  const resolvedName =
    name === 'AgentOutputTool'
      ? 'TaskOutput'
      : name === 'BashOutputTool'
        ? 'TaskOutput'
        : name === 'BashOutput'
          ? 'TaskOutput'
          : name === 'TaskOutputTool'
            ? 'TaskOutput'
            : name

  return {
    originalName,
    resolvedName,
    wasAliased: resolvedName !== originalName,
  }
}
