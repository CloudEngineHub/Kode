import { basename, dirname, join, resolve } from 'node:path'
import { copyFileSync, existsSync, lstatSync } from 'node:fs'

import { getCwd } from '#core/utils/state'
import { legacyPluginPathInProject } from '#core/compat/legacyPaths'

import type { PluginScope } from '../types'
import {
  ensureDir,
  ensureEmptyDir,
  safeCopyDirectory,
  safeJoinWithin,
} from '../fsUtils'
import {
  normalizePluginScope,
  scopeCommandsDir,
  scopeInstalledPluginRoot,
  scopeSkillsDir,
} from '../paths'
import {
  ensurePluginInstallState,
  savePluginInstallState,
} from '../pluginState'
import { getMarketplaceManifest } from '../marketplaces'
import { resolvePluginForInstall } from './resolve'
import type { MarketplaceSource } from '../schema'

export function installSkillPlugin(
  pluginInput: string,
  options?: { scope?: PluginScope; project?: boolean; force?: boolean },
): {
  pluginSpec: string
  installedSkills: string[]
  installedCommands: string[]
} {
  const scope = normalizePluginScope(options)
  const { plugin, marketplace, pluginSpec } =
    resolvePluginForInstall(pluginInput)
  const { manifest, rootDir, source } = getMarketplaceManifest(marketplace)

  const entry = manifest.plugins.find(p => p.name === plugin)
  if (!entry) {
    const available = manifest.plugins
      .map(p => p.name)
      .sort()
      .join(', ')
    throw new Error(
      `Plugin '${plugin}' not found in marketplace '${marketplace}'. Available plugins: ${available || '(none)'}`,
    )
  }

  const installState = ensurePluginInstallState()
  const existing = installState[pluginSpec]
  if (existing && existing.scope !== scope && options?.force !== true) {
    throw new Error(
      `Plugin '${pluginSpec}' is already installed with scope=${existing.scope}. Uninstall it first to install with scope=${scope}.`,
    )
  }
  if (existing && options?.force !== true) {
    throw new Error(
      `Plugin '${pluginSpec}' is already installed. Re-run with --force to reinstall.`,
    )
  }

  const entrySourceBase = resolve(rootDir, entry.source ?? './')
  const primaryManifestPath = join(
    entrySourceBase,
    '.kode-plugin',
    'plugin.json',
  )
  const legacyManifestPath = legacyPluginPathInProject(
    entrySourceBase,
    'plugin.json',
  )
  const pluginManifestPath = existsSync(primaryManifestPath)
    ? primaryManifestPath
    : legacyManifestPath

  if (
    existsSync(pluginManifestPath) &&
    lstatSync(pluginManifestPath).isFile()
  ) {
    const pluginRoot = scopeInstalledPluginRoot(scope, plugin, marketplace)
    if (existsSync(pluginRoot) && options?.force !== true) {
      throw new Error(`Destination already exists: ${pluginRoot}`)
    }
    ensureEmptyDir(pluginRoot)
    safeCopyDirectory(entrySourceBase, pluginRoot)

    installState[pluginSpec] = {
      plugin,
      marketplace,
      scope,
      kind: 'plugin-pack',
      pluginRoot,
      isEnabled: true,
      projectPath: scope === 'user' ? undefined : getCwd(),
      installedAt: new Date().toISOString(),
      skills: [],
      commands: [],
      sourceMarketplacePath: sourcePathForRecord(source),
    }
    savePluginInstallState(installState)

    return { pluginSpec, installedSkills: [], installedCommands: [] }
  }

  const skillsDestBase = scopeSkillsDir(scope)
  const commandsDestBase = join(scopeCommandsDir(scope), plugin, marketplace)

  ensureDir(skillsDestBase)
  ensureDir(commandsDestBase)

  const installedSkills: string[] = []
  const installedCommands: string[] = []

  const skillPaths = entry.skills ?? []
  for (const rel of skillPaths) {
    const src = safeJoinWithin(entrySourceBase, rel)
    if (!existsSync(src) || !lstatSync(src).isDirectory()) {
      throw new Error(`Skill path not found or not a directory: ${src}`)
    }
    const skillName = basename(src)
    const dest = join(skillsDestBase, skillName)

    if (existsSync(dest) && options?.force !== true) {
      throw new Error(`Destination already exists: ${dest}`)
    }
    ensureEmptyDir(dest)
    safeCopyDirectory(src, dest)
    installedSkills.push(skillName)
  }

  const commandPaths = entry.commands ?? []
  for (const rel of commandPaths) {
    const src = safeJoinWithin(entrySourceBase, rel)
    if (!existsSync(src)) {
      throw new Error(`Command path not found: ${src}`)
    }
    const stat = lstatSync(src)
    if (stat.isDirectory()) {
      const dest = join(commandsDestBase, basename(src))
      if (existsSync(dest) && options?.force !== true) {
        throw new Error(`Destination already exists: ${dest}`)
      }
      ensureEmptyDir(dest)
      safeCopyDirectory(src, dest)
      installedCommands.push(dest)
      continue
    }
    if (stat.isFile()) {
      const dest = join(commandsDestBase, basename(src))
      ensureDir(dirname(dest))
      if (existsSync(dest) && options?.force !== true) {
        throw new Error(`Destination already exists: ${dest}`)
      }
      copyFileSync(src, dest)
      installedCommands.push(dest)
    }
  }

  installState[pluginSpec] = {
    plugin,
    marketplace,
    scope,
    kind: 'skill-pack',
    isEnabled: true,
    projectPath: scope === 'user' ? undefined : getCwd(),
    installedAt: new Date().toISOString(),
    skills: installedSkills,
    commands: installedCommands,
    sourceMarketplacePath: sourcePathForRecord(source),
  }
  savePluginInstallState(installState)

  return { pluginSpec, installedSkills, installedCommands }
}

function sourcePathForRecord(source: MarketplaceSource): string {
  return source.source === 'file' || source.source === 'directory'
    ? source.path
    : source.source === 'github'
      ? `github:${source.repo}`
      : source.source === 'url'
        ? source.url
        : source.source === 'git'
          ? source.url
          : `npm:${source.package}`
}
