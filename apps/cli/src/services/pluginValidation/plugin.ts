import { existsSync, lstatSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { z } from 'zod'

import type { ValidationIssue, ValidationResult } from './types'
import { safeResolveWithin, validateRelativePath } from './utils'

const PluginManifestSchema = z
  .strictObject({
    name: z.string().min(1),
    version: z.string().optional(),
    description: z.string().optional(),
    author: z.unknown().optional(),
    homepage: z.string().optional(),
    repository: z.unknown().optional(),
    license: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    commands: z.union([z.string(), z.array(z.string())]).optional(),
    agents: z.union([z.string(), z.array(z.string())]).optional(),
    skills: z.union([z.string(), z.array(z.string())]).optional(),
    outputStyles: z.union([z.string(), z.array(z.string())]).optional(),
    hooks: z
      .union([
        z.string(),
        z.array(z.string()),
        z.record(z.string(), z.unknown()),
      ])
      .optional(),
    mcpServers: z
      .union([
        z.string(),
        z.array(z.string()),
        z.record(z.string(), z.unknown()),
      ])
      .optional(),
  })
  .passthrough()

export function validatePluginJson(filePath: string): ValidationResult {
  const errors: ValidationIssue[] = []
  const warnings: ValidationIssue[] = []

  let raw: string
  try {
    raw = readFileSync(filePath, 'utf8')
  } catch (err) {
    return {
      success: false,
      fileType: 'plugin',
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
      fileType: 'plugin',
      filePath,
      errors: [
        { path: 'json', message: `Invalid JSON syntax: ${String(err)}` },
      ],
      warnings: [],
    }
  }

  const parsed = PluginManifestSchema.safeParse(json)
  if (!parsed.success) {
    errors.push(
      ...parsed.error.issues.map(i => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    )
    return { success: false, fileType: 'plugin', filePath, errors, warnings }
  }

  const data = parsed.data

  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(data.name)) {
    errors.push({
      path: 'name',
      message: 'Must be kebab-case and start with a letter',
    })
  }

  if (
    data.version &&
    !/^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(
      data.version,
    )
  ) {
    errors.push({
      path: 'version',
      message: 'Invalid semantic version (expected MAJOR.MINOR.PATCH)',
    })
  }

  if (data.homepage) {
    try {
      // eslint-disable-next-line no-new
      new URL(data.homepage)
    } catch {
      errors.push({ path: 'homepage', message: 'Invalid URL' })
    }
  }

  if (typeof data.repository === 'string') {
    try {
      // eslint-disable-next-line no-new
      new URL(data.repository)
    } catch {
      errors.push({ path: 'repository', message: 'Invalid URL' })
    }
  }

  if (!data.version) {
    warnings.push({
      path: 'version',
      message:
        'No version specified. Consider adding a version following semver (e.g., "1.0.0")',
    })
  }

  if (!data.description) {
    warnings.push({
      path: 'description',
      message:
        'No description provided. Adding a description helps users understand what your plugin does',
    })
  }

  if (!data.author) {
    warnings.push({
      path: 'author',
      message:
        'No author information provided. Consider adding author details for plugin attribution',
    })
  }

  const pluginRoot = dirname(dirname(filePath))

  const validatePathList = (field: string, value: unknown) => {
    if (!value) return
    const values = Array.isArray(value) ? value : [value]
    for (const [idx, p] of values.entries()) {
      if (typeof p !== 'string') continue
      const err = validateRelativePath(p)
      if (err) errors.push({ path: `${field}[${idx}]`, message: err })
      const abs = safeResolveWithin(pluginRoot, p)
      if (!abs) {
        errors.push({
          path: `${field}[${idx}]`,
          message: 'Invalid path (must be ./..., no .., forward slashes)',
        })
      } else if (!existsSync(abs)) {
        errors.push({
          path: `${field}[${idx}]`,
          message: `Path not found: ${p}`,
        })
      }
    }
  }

  validatePathList('commands', data.commands)
  validatePathList('agents', data.agents)
  validatePathList('skills', data.skills)

  if (typeof data.hooks === 'string') validatePathList('hooks', data.hooks)
  if (typeof data.mcpServers === 'string')
    validatePathList('mcpServers', data.mcpServers)

  // If plugin root looks like a plugin directory, warn if the manifests are missing.
  const pluginManifest = join(pluginRoot, '.kode-plugin', 'plugin.json')
  if (
    !existsSync(pluginManifest) &&
    lstatSync(dirname(filePath)).isDirectory()
  ) {
    warnings.push({
      path: 'plugin.json',
      message: 'Manifest is not under .kode-plugin/plugin.json',
    })
  }

  return {
    success: errors.length === 0,
    fileType: 'plugin',
    filePath,
    errors,
    warnings,
  }
}
