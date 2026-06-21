import { LEGACY_ENV } from '#core/compat/legacyEnv'

export const USE_BEDROCK = !!(
  process.env.KODE_USE_BEDROCK ?? process.env[LEGACY_ENV.codeUseBedrock]
)

export const USE_VERTEX = !!(
  process.env.KODE_USE_VERTEX ?? process.env[LEGACY_ENV.codeUseVertex]
)
