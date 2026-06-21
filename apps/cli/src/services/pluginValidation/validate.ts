import { existsSync, lstatSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  LEGACY_PLUGIN_DIRNAME,
  legacyPluginPathInProject,
} from '#core/compat/legacyPaths'
import type { ValidationResult } from './types'
import { resolveFromAgentCwd } from './utils'
import { validateMarketplaceJson } from './marketplace'
import { validatePluginJson } from './plugin'

function looksLikeMarketplace(json: unknown): boolean {
  if (!json || typeof json !== 'object') return false
  const record = json as Record<string, unknown>
  return Array.isArray(record.plugins)
}

export function validatePluginOrMarketplacePath(
  path: string,
): ValidationResult {
  const abs = resolveFromAgentCwd(path)
  if (!abs) {
    return {
      success: false,
      fileType: 'plugin',
      filePath: '',
      errors: [{ path: 'path', message: 'Path is required' }],
      warnings: [],
    }
  }
  if (!existsSync(abs)) {
    return {
      success: false,
      fileType: 'plugin',
      filePath: abs,
      errors: [{ path: 'file', message: `Path not found: ${abs}` }],
      warnings: [],
    }
  }

  const stat = lstatSync(abs)
  let filePath = abs
  if (stat.isDirectory()) {
    const marketplace = join(abs, '.kode-plugin', 'marketplace.json')
    const plugin = join(abs, '.kode-plugin', 'plugin.json')
    const legacyMarketplace = legacyPluginPathInProject(abs, 'marketplace.json')
    const legacyPlugin = legacyPluginPathInProject(abs, 'plugin.json')
    if (existsSync(marketplace)) filePath = marketplace
    else if (existsSync(plugin)) filePath = plugin
    else if (existsSync(legacyMarketplace)) filePath = legacyMarketplace
    else if (existsSync(legacyPlugin)) filePath = legacyPlugin
    else {
      return {
        success: false,
        fileType: 'plugin',
        filePath: abs,
        errors: [
          {
            path: 'directory',
            message: `No manifest found in directory. Expected .kode-plugin/marketplace.json or .kode-plugin/plugin.json (legacy ${LEGACY_PLUGIN_DIRNAME}/* is also supported)`,
          },
        ],
        warnings: [],
      }
    }
  }

  if (filePath.endsWith('marketplace.json'))
    return validateMarketplaceJson(filePath)
  if (filePath.endsWith('plugin.json')) return validatePluginJson(filePath)

  try {
    const raw = readFileSync(filePath, 'utf8')
    const json = JSON.parse(raw)
    if (looksLikeMarketplace(json)) {
      return validateMarketplaceJson(filePath)
    }
  } catch {
    // ignore
  }

  return validatePluginJson(filePath)
}
