export type ToolNameAliasResolution = {
  originalName: string
  resolvedName: string
  wasAliased: boolean
}

type ToolNameAliasGroups = Record<string, readonly string[]>

function buildToolNameAliasMap(
  groups: ToolNameAliasGroups,
): Record<string, string> {
  const aliasToCanonical: Record<string, string> = {}

  for (const [canonicalName, aliases] of Object.entries(groups)) {
    for (const alias of aliases) {
      const existing = aliasToCanonical[alias]
      if (existing && existing !== canonicalName) {
        throw new Error(
          `Tool name alias conflict for "${alias}": "${existing}" vs "${canonicalName}"`,
        )
      }
      aliasToCanonical[alias] = canonicalName
    }
  }

  return aliasToCanonical
}

const CANONICAL_TOOL_ALIASES: ToolNameAliasGroups = {
  // Some upstream clients unify AgentOutputTool and BashOutputTool into TaskOutput (with aliases).
  TaskOutput: [
    'AgentOutputTool',
    'BashOutputTool',
    'BashOutput',
    'TaskOutputTool',
  ],

  // Upstream uses TaskStop with KillShell as a legacy alias.
  TaskStop: ['KillShell'],

  // Legacy client tool surfaces use lowerCamelCase for these MCP helpers.
  // Kode keeps canonical ids but accepts legacy names as aliases.
  ListMcpResourcesTool: ['listMcpResources'],
  ReadMcpResourceTool: ['readMcpResource'],
}

const TOOL_NAME_ALIAS_MAP = buildToolNameAliasMap(CANONICAL_TOOL_ALIASES)

export function __buildToolNameAliasMapForTests(
  groups: ToolNameAliasGroups,
): Record<string, string> {
  return buildToolNameAliasMap(groups)
}

/**
 * Resolve legacy tool aliases to their canonical tool names.
 *
 * Some upstream clients unify AgentOutputTool and BashOutputTool into TaskOutput.
 * (with aliases). Kode keeps backward compatibility by resolving the alias names.
 */
export function resolveToolNameAlias(name: string): ToolNameAliasResolution {
  const originalName = name
  const resolvedName = TOOL_NAME_ALIAS_MAP[name] ?? name

  return {
    originalName,
    resolvedName,
    wasAliased: resolvedName !== originalName,
  }
}
