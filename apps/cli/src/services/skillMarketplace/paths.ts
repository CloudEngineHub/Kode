import { join } from 'node:path'

import { CONFIG_BASE_DIR } from '#core/constants/product'
import { getCwd } from '#core/utils/state'
import { getKodeBaseDir } from '#core/utils/env'

import type { PluginScope } from './types'

const KNOWN_MARKETPLACES_FILE = 'known_marketplaces.json'
const MARKETPLACES_CACHE_DIR = 'marketplaces'
const INSTALLED_SKILL_PLUGINS_FILE = 'installed-skill-plugins.json'

export function userKodeDir(): string {
  return getKodeBaseDir()
}

export function normalizePluginScope(options?: {
  scope?: PluginScope
  project?: boolean
}): PluginScope {
  if (
    options?.scope === 'user' ||
    options?.scope === 'project' ||
    options?.scope === 'local'
  ) {
    return options.scope
  }
  if (options?.project === true) return 'project'
  return 'user'
}

export function scopeBaseDir(scope: PluginScope): string {
  if (scope === 'user') return userKodeDir()
  return join(getCwd(), CONFIG_BASE_DIR)
}

export function scopeSkillsDir(scope: PluginScope): string {
  return join(scopeBaseDir(scope), 'skills')
}

export function scopeCommandsDir(scope: PluginScope): string {
  return join(scopeBaseDir(scope), 'commands')
}

export function scopeInstalledPluginsDir(scope: PluginScope): string {
  return join(scopeBaseDir(scope), 'plugins', 'installed')
}

export function scopeInstalledPluginRoot(
  scope: PluginScope,
  plugin: string,
  marketplace: string,
): string {
  return join(scopeInstalledPluginsDir(scope), plugin, marketplace)
}

function pluginsDir(): string {
  return join(userKodeDir(), 'plugins')
}

export function knownMarketplacesConfigPath(): string {
  return join(pluginsDir(), KNOWN_MARKETPLACES_FILE)
}

export function marketplaceCacheBaseDir(): string {
  return join(pluginsDir(), MARKETPLACES_CACHE_DIR)
}

export function installedSkillPluginsPath(): string {
  return join(userKodeDir(), INSTALLED_SKILL_PLUGINS_FILE)
}
