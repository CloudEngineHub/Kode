import {
  LEGACY_CLAUDE_ENV as LEGACY_CLAUDE_ENV_VALUE,
  LEGACY_ENV as LEGACY_ENV_VALUE,
} from './legacyEnv'

/**
 * @deprecated Claude Code compatibility env names are retained for legacy config
 * import only. Prefer Kode-native config/env names for new code.
 */
export const LEGACY_ENV = LEGACY_ENV_VALUE

/**
 * @deprecated Use LEGACY_ENV only for legacy import compatibility. Prefer
 * Kode-native config/env names for new code.
 */
export const LEGACY_CLAUDE_ENV = LEGACY_CLAUDE_ENV_VALUE
