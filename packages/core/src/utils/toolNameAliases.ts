export type ToolNameAliasResolution = {
  originalName: string
  resolvedName: string
  wasAliased: boolean
}

/**
 * Resolve legacy tool aliases to their canonical tool names.
 *
 * Some upstream clients unify AgentOutputTool and BashOutputTool into TaskOutput.
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
