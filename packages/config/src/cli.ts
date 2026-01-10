import { pick } from 'lodash-es'

import type { GlobalConfig, ProjectConfig } from './schema'
import {
  GLOBAL_CONFIG_KEYS,
  PROJECT_CONFIG_KEYS,
  isAutoUpdaterStatus,
  isGlobalConfigKey,
  isProjectConfigKey,
} from './schema'
import {
  getCurrentProjectConfig,
  getGlobalConfig,
  saveCurrentProjectConfig,
  saveGlobalConfig,
} from './loader'

export function getConfigForCLI(key: string, global: boolean): unknown {
  if (global) {
    if (!isGlobalConfigKey(key)) {
      console.error(
        `Error: '${key}' is not a valid config key. Valid keys are: ${GLOBAL_CONFIG_KEYS.join(', ')}`,
      )
      process.exit(1)
    }
    return getGlobalConfig()[key]
  }

  if (!isProjectConfigKey(key)) {
    console.error(
      `Error: '${key}' is not a valid config key. Valid keys are: ${PROJECT_CONFIG_KEYS.join(', ')}`,
    )
    process.exit(1)
  }
  return getCurrentProjectConfig()[key]
}

export function setConfigForCLI(
  key: string,
  value: unknown,
  global: boolean,
): void {
  if (global) {
    if (!isGlobalConfigKey(key)) {
      console.error(
        `Error: Cannot set '${key}'. Only these keys can be modified: ${GLOBAL_CONFIG_KEYS.join(', ')}`,
      )
      process.exit(1)
    }

    if (key === 'autoUpdaterStatus' && !isAutoUpdaterStatus(String(value))) {
      console.error(
        `Error: Invalid value for autoUpdaterStatus. Must be one of: disabled, enabled, no_permissions, not_configured`,
      )
      process.exit(1)
    }

    const currentConfig = getGlobalConfig()
    saveGlobalConfig({
      ...currentConfig,
      [key]: value,
    } as unknown as GlobalConfig)
  } else {
    if (!isProjectConfigKey(key)) {
      console.error(
        `Error: Cannot set '${key}'. Only these keys can be modified: ${PROJECT_CONFIG_KEYS.join(', ')}. Did you mean --global?`,
      )
      process.exit(1)
    }
    const currentConfig = getCurrentProjectConfig()
    saveCurrentProjectConfig({
      ...currentConfig,
      [key]: value,
    } as unknown as ProjectConfig)
  }

  setTimeout(() => process.exit(0), 100)
}

export function deleteConfigForCLI(key: string, global: boolean): void {
  if (global) {
    if (!isGlobalConfigKey(key)) {
      console.error(
        `Error: Cannot delete '${key}'. Only these keys can be modified: ${GLOBAL_CONFIG_KEYS.join(', ')}`,
      )
      process.exit(1)
    }
    const currentConfig = getGlobalConfig()
    const next: Record<string, unknown> = { ...currentConfig }
    delete next[key]
    saveGlobalConfig(next as unknown as GlobalConfig)
    return
  }

  if (!isProjectConfigKey(key)) {
    console.error(
      `Error: Cannot delete '${key}'. Only these keys can be modified: ${PROJECT_CONFIG_KEYS.join(', ')}. Did you mean --global?`,
    )
    process.exit(1)
  }
  const currentConfig = getCurrentProjectConfig()
  const next: Record<string, unknown> = { ...currentConfig }
  delete next[key]
  saveCurrentProjectConfig(next as unknown as ProjectConfig)
}

export function listConfigForCLI(global: true): GlobalConfig
export function listConfigForCLI(global: false): ProjectConfig
export function listConfigForCLI(global: boolean): object {
  if (global) return pick(getGlobalConfig(), GLOBAL_CONFIG_KEYS)
  return pick(getCurrentProjectConfig(), PROJECT_CONFIG_KEYS)
}

export function getOpenAIApiKey(): string | undefined {
  return process.env.OPENAI_API_KEY
}

export function getAnthropicApiKey(): string {
  return process.env.ANTHROPIC_API_KEY || ''
}
