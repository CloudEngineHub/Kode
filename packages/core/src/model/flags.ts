export const USE_BEDROCK = !!(
  process.env.KODE_USE_BEDROCK ?? process.env.CLAUDE_CODE_USE_BEDROCK
)

export const USE_VERTEX = !!(
  process.env.KODE_USE_VERTEX ?? process.env.CLAUDE_CODE_USE_VERTEX
)
