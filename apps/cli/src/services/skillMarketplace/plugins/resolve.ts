import { join } from 'node:path'

import { CONFIG_BASE_DIR } from '#core/constants/product'

import type { InstalledSkillPlugin, InstalledSkillPluginsFile } from '../types'
import type { PluginEntry } from '../schema'
import { loadKnownMarketplaces, readMarketplaceFromDirectory } from '../store'
import { userKodeDir } from '../paths'

export function parsePluginSpec(spec: string): {
  plugin: string
  marketplace: string
} {
  const trimmed = spec.trim()
  const parts = trimmed.split('@')
  if (parts.length !== 2) {
    throw new Error(
      `Invalid plugin spec: ${spec}. Expected format: <plugin>@<marketplace>`,
    )
  }
  const plugin = parts[0]!.trim()
  const marketplace = parts[1]!.trim()
  if (!plugin || !marketplace) {
    throw new Error(
      `Invalid plugin spec: ${spec}. Expected format: <plugin>@<marketplace>`,
    )
  }
  return { plugin, marketplace }
}

export function resolvePluginForInstall(pluginInput: string): {
  plugin: string
  marketplace: string
  pluginSpec: string
} {
  const trimmed = pluginInput.trim()
  if (!trimmed) throw new Error('Plugin is required')

  if (trimmed.includes('@')) {
    const resolved = parsePluginSpec(trimmed)
    return {
      ...resolved,
      pluginSpec: `${resolved.plugin}@${resolved.marketplace}`,
    }
  }

  const config = loadKnownMarketplaces()
  const matches: { marketplace: string; entry: PluginEntry }[] = []
  for (const [marketplace, entry] of Object.entries(config)) {
    try {
      const manifest = readMarketplaceFromDirectory(entry.installLocation)
      const found = manifest.plugins.find(p => p.name === trimmed)
      if (found) matches.push({ marketplace, entry: found })
    } catch {
      // ignore unreadable marketplaces during resolution
    }
  }

  if (matches.length === 0) {
    const availableMarketplaces = Object.keys(config).sort().join(', ')
    throw new Error(
      `Plugin '${trimmed}' not found in any marketplace. Available marketplaces: ${availableMarketplaces || '(none)'}`,
    )
  }

  if (matches.length > 1) {
    const options = matches
      .map(m => `${trimmed}@${m.marketplace}`)
      .sort()
      .join(', ')
    throw new Error(
      `Plugin '${trimmed}' is available in multiple marketplaces. Use an explicit spec: ${options}`,
    )
  }

  return {
    plugin: trimmed,
    marketplace: matches[0]!.marketplace,
    pluginSpec: `${trimmed}@${matches[0]!.marketplace}`,
  }
}

export function resolveInstalledPluginSpec(
  pluginInput: string,
  state: InstalledSkillPluginsFile,
): string {
  const trimmed = pluginInput.trim()
  if (!trimmed) throw new Error('Plugin is required')

  if (trimmed.includes('@')) {
    parsePluginSpec(trimmed)
    return trimmed
  }

  const matches = Object.entries(state).filter(
    ([, record]) => record?.plugin === trimmed,
  )
  if (matches.length === 0) {
    throw new Error(`Plugin '${trimmed}' is not installed`)
  }
  if (matches.length > 1) {
    const options = matches
      .map(([spec]) => spec)
      .sort()
      .join(', ')
    throw new Error(
      `Plugin '${trimmed}' is installed from multiple marketplaces. Use an explicit spec: ${options}`,
    )
  }
  return matches[0]![0]
}

export function baseDirForInstallRecord(record: InstalledSkillPlugin): string {
  if (record.scope === 'user') return userKodeDir()
  const projectPath =
    typeof record.projectPath === 'string' ? record.projectPath.trim() : ''
  if (!projectPath) {
    throw new Error(
      `Installed plugin '${record.plugin}@${record.marketplace}' is missing projectPath for scope=${record.scope}`,
    )
  }
  return join(projectPath, CONFIG_BASE_DIR)
}
