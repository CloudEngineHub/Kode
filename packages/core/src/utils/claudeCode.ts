const TRUTHY_VALUES = new Set(['1', 'true', 'yes', 'on'])

function isTruthyEnv(value: string | undefined): boolean {
  if (!value) return false
  return TRUTHY_VALUES.has(value.trim().toLowerCase())
}

export type ClaudeCodeProviderType =
  | 'bedrock'
  | 'vertex'
  | 'foundry'
  | 'firstParty'

export function getClaudeCodeProviderType(): ClaudeCodeProviderType {
  if (
    isTruthyEnv(
      process.env.KODE_USE_BEDROCK ?? process.env.CLAUDE_CODE_USE_BEDROCK,
    )
  ) {
    return 'bedrock'
  }
  if (
    isTruthyEnv(
      process.env.KODE_USE_VERTEX ?? process.env.CLAUDE_CODE_USE_VERTEX,
    )
  ) {
    return 'vertex'
  }
  if (
    isTruthyEnv(
      process.env.KODE_USE_FOUNDRY ?? process.env.CLAUDE_CODE_USE_FOUNDRY,
    )
  ) {
    return 'foundry'
  }
  return 'firstParty'
}

export function isClaudeCodeFirstParty(): boolean {
  return getClaudeCodeProviderType() === 'firstParty'
}
