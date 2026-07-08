export const MODEL_COSTS = {
  haiku: {
    inputPerMillionTokens: 0.8,
    outputPerMillionTokens: 4,
    promptCacheWritePerMillionTokens: 1,
    promptCacheReadPerMillionTokens: 0.08,
  },
  sonnet: {
    inputPerMillionTokens: 3,
    outputPerMillionTokens: 15,
    promptCacheWritePerMillionTokens: 3.75,
    promptCacheReadPerMillionTokens: 0.3,
  },
} as const

export const MCP_DEFAULTS = {
  healthCheckIntervalMs: 5_000,
  failedRetryIntervalMs: 30_000,
} as const

export const ENGINE_DEFAULTS = {
  mainQueryTemperature: 1,
  contextReserveRatio: 0.1,
  contextReserveCapTokens: 20_000,
  autoCompactMarginTokens: 13_000,
  warningMarginTokens: 20_000,
  errorMarginTokens: 20_000,
} as const
