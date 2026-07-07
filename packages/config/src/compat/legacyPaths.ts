import { join } from 'node:path'

// Legacy on-disk directory names used for read/scan/import compatibility.
// Kode never writes new state into them.
/** @deprecated Prefer Kode-native config directory names for new code. */
export const LEGACY_CONFIG_DIRNAME = '.claude'

/** @deprecated Prefer Kode-native plugin directory names for new code. */
export const LEGACY_PLUGIN_DIRNAME = '.claude-plugin'

/** @deprecated Prefer Kode-native config paths for new code. */
export const LEGACY_CONFIG_SUBDIRS = {
  agents: join(LEGACY_CONFIG_DIRNAME, 'agents'),
  commands: join(LEGACY_CONFIG_DIRNAME, 'commands'),
  skills: join(LEGACY_CONFIG_DIRNAME, 'skills'),
  outputStyles: join(LEGACY_CONFIG_DIRNAME, 'output-styles'),
} as const

/** @deprecated Prefer Kode-native config paths for new code. */
export const LEGACY_CONFIG_FILES = {
  settingsJson: join(LEGACY_CONFIG_DIRNAME, 'settings.json'),
  settingsLocalJson: join(LEGACY_CONFIG_DIRNAME, 'settings.local.json'),
} as const

/** @deprecated Prefer Kode-native config paths for new code. */
export function legacyConfigPathInProject(
  projectDir: string,
  ...parts: string[]
): string {
  return join(projectDir, LEGACY_CONFIG_DIRNAME, ...parts)
}

/** @deprecated Prefer Kode-native plugin paths for new code. */
export function legacyPluginPathInProject(
  projectDir: string,
  ...parts: string[]
): string {
  return join(projectDir, LEGACY_PLUGIN_DIRNAME, ...parts)
}
