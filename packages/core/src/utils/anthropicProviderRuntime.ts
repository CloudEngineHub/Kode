import { LEGACY_ENV } from '#core/compat/legacyEnv'

const TRUTHY_VALUES = new Set(['1', 'true', 'yes', 'on'])

function isTruthyEnv(value: string | undefined): boolean {
  if (!value) return false
  return TRUTHY_VALUES.has(value.trim().toLowerCase())
}

export type AnthropicProviderRuntime =
  | 'bedrock'
  | 'vertex'
  | 'foundry'
  | 'firstParty'

export function getAnthropicProviderRuntime(): AnthropicProviderRuntime {
  if (
    isTruthyEnv(
      process.env.KODE_USE_BEDROCK ?? process.env[LEGACY_ENV.codeUseBedrock],
    )
  ) {
    return 'bedrock'
  }
  if (
    isTruthyEnv(
      process.env.KODE_USE_VERTEX ?? process.env[LEGACY_ENV.codeUseVertex],
    )
  ) {
    return 'vertex'
  }
  if (
    isTruthyEnv(
      process.env.KODE_USE_FOUNDRY ?? process.env[LEGACY_ENV.codeUseFoundry],
    )
  ) {
    return 'foundry'
  }
  return 'firstParty'
}

export function isAnthropicFirstPartyRuntime(): boolean {
  return getAnthropicProviderRuntime() === 'firstParty'
}
