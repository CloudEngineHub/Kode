import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  LEGACY_PLUGIN_DIRNAME,
  legacyPluginPathInProject,
} from '#core/compat/legacyPaths'
import {
  KnownMarketplacesSchema,
  MarketplaceManifestSchema,
  type KnownMarketplacesConfig,
  type MarketplaceManifest,
} from './schema'
import { knownMarketplacesConfigPath } from './paths'
import { readJsonFile, writeJsonFile } from './json'

export function loadKnownMarketplaces(): KnownMarketplacesConfig {
  const raw = readJsonFile<unknown>(knownMarketplacesConfigPath(), {})
  const parsed = KnownMarketplacesSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(
      `Marketplace configuration is corrupted: ${parsed.error.issues.map(i => i.message).join('; ')}`,
    )
  }
  return parsed.data
}

export function saveKnownMarketplaces(config: KnownMarketplacesConfig): void {
  const parsed = KnownMarketplacesSchema.safeParse(config)
  if (!parsed.success) {
    throw new Error(`Invalid marketplace config: ${parsed.error.message}`)
  }
  writeJsonFile(knownMarketplacesConfigPath(), parsed.data)
}

export function readMarketplaceFromDirectory(
  rootDir: string,
): MarketplaceManifest {
  const primaryMarketplaceFile = resolve(
    rootDir,
    '.kode-plugin',
    'marketplace.json',
  )
  const legacyMarketplaceFile = legacyPluginPathInProject(
    rootDir,
    'marketplace.json',
  )
  const marketplaceFile = existsSync(primaryMarketplaceFile)
    ? primaryMarketplaceFile
    : legacyMarketplaceFile
  if (!existsSync(marketplaceFile)) {
    throw new Error(
      `Marketplace file not found (expected .kode-plugin/marketplace.json or ${LEGACY_PLUGIN_DIRNAME}/marketplace.json)`,
    )
  }
  const raw = readFileSync(marketplaceFile, 'utf8')
  const parsed = MarketplaceManifestSchema.safeParse(JSON.parse(raw))
  if (!parsed.success) {
    throw new Error(
      `Invalid marketplace.json: ${parsed.error.issues.map(i => i.message).join('; ')}`,
    )
  }
  return parsed.data
}
