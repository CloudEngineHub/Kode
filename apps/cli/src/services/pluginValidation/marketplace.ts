import { existsSync, lstatSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { MarketplaceManifestSchema } from '#cli-services/skillMarketplace'

import type { MarketplaceManifest } from '#cli-services/skillMarketplace'

import type { ValidationIssue, ValidationResult } from './types'
import { safeResolveWithin, validateRelativePath } from './utils'
import { validateSkillDir } from './skills'

function metadataDescriptionFrom(manifest: MarketplaceManifest): string {
  const metadata = manifest.metadata as unknown
  if (!metadata || typeof metadata !== 'object') return ''
  const record = metadata as Record<string, unknown>
  const value = record.description
  if (typeof value !== 'string') return ''
  return value.trim()
}

export function validateMarketplaceJson(filePath: string): ValidationResult {
  const errors: ValidationIssue[] = []
  const warnings: ValidationIssue[] = []

  let raw: string
  try {
    raw = readFileSync(filePath, 'utf8')
  } catch (err) {
    return {
      success: false,
      fileType: 'marketplace',
      filePath,
      errors: [
        { path: 'file', message: `Failed to read file: ${String(err)}` },
      ],
      warnings: [],
    }
  }

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch (err) {
    return {
      success: false,
      fileType: 'marketplace',
      filePath,
      errors: [
        { path: 'json', message: `Invalid JSON syntax: ${String(err)}` },
      ],
      warnings: [],
    }
  }

  const parsed = MarketplaceManifestSchema.safeParse(json)
  if (!parsed.success) {
    errors.push(
      ...parsed.error.issues.map(i => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    )
    return {
      success: false,
      fileType: 'marketplace',
      filePath,
      errors,
      warnings,
    }
  }

  const data = parsed.data
  const topLevelDescription =
    typeof data.description === 'string' ? data.description.trim() : ''
  const metadataDescription = metadataDescriptionFrom(data)

  if (!topLevelDescription && !metadataDescription) {
    warnings.push({
      path: 'description',
      message:
        'No marketplace description provided. Adding a description helps users understand what this marketplace offers',
    })
  }

  if (!data.plugins || data.plugins.length === 0) {
    warnings.push({
      path: 'plugins',
      message: 'Marketplace has no plugins defined',
    })
  }

  const pluginNames = new Set<string>()
  for (const [index, plugin] of data.plugins.entries()) {
    if (pluginNames.has(plugin.name)) {
      errors.push({
        path: `plugins[${index}].name`,
        message: `Duplicate plugin name "${plugin.name}"`,
      })
    }
    pluginNames.add(plugin.name)

    const source = plugin.source ?? './'
    const sourceErr = validateRelativePath(source)
    if (sourceErr) {
      errors.push({ path: `plugins[${index}].source`, message: sourceErr })
    }

    const marketplaceRoot = dirname(dirname(filePath))
    const pluginBase = safeResolveWithin(marketplaceRoot, source)
    if (!pluginBase) {
      errors.push({
        path: `plugins[${index}].source`,
        message: 'Invalid source path (must be ./..., no .., forward slashes)',
      })
      continue
    }

    if (!existsSync(pluginBase) || !lstatSync(pluginBase).isDirectory()) {
      errors.push({
        path: `plugins[${index}].source`,
        message: `Source path not found: ${source}`,
      })
      continue
    }

    const skillPaths = plugin.skills ?? []
    for (const [j, rel] of skillPaths.entries()) {
      const err = validateRelativePath(rel)
      if (err) {
        errors.push({ path: `plugins[${index}].skills[${j}]`, message: err })
        continue
      }
      const abs = safeResolveWithin(pluginBase, rel)
      if (!abs) {
        errors.push({
          path: `plugins[${index}].skills[${j}]`,
          message: 'Invalid path (must be ./..., no .., forward slashes)',
        })
        continue
      }
      if (!existsSync(abs) || !lstatSync(abs).isDirectory()) {
        errors.push({
          path: `plugins[${index}].skills[${j}]`,
          message: `Skill directory not found: ${rel}`,
        })
        continue
      }
      errors.push(
        ...validateSkillDir(abs).map(e => ({
          ...e,
          path: `plugins[${index}].skills[${j}]: ${e.path}`,
        })),
      )
    }

    const commandPaths = plugin.commands ?? []
    for (const [j, rel] of commandPaths.entries()) {
      const err = validateRelativePath(rel)
      if (err) {
        errors.push({ path: `plugins[${index}].commands[${j}]`, message: err })
        continue
      }
      const abs = safeResolveWithin(pluginBase, rel)
      if (!abs) {
        errors.push({
          path: `plugins[${index}].commands[${j}]`,
          message: 'Invalid path (must be ./..., no .., forward slashes)',
        })
        continue
      }
      if (!existsSync(abs) || !lstatSync(abs).isDirectory()) {
        errors.push({
          path: `plugins[${index}].commands[${j}]`,
          message: `Command directory not found: ${rel}`,
        })
      }
    }
  }

  return {
    success: errors.length === 0,
    fileType: 'marketplace',
    filePath,
    errors,
    warnings,
  }
}
