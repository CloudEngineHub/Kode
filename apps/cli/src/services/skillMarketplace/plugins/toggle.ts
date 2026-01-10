import { existsSync, renameSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { getCwd } from '#core/utils/state'

import type { PluginScope } from '../types'
import { ensureDir } from '../fsUtils'
import {
  ensurePluginInstallState,
  savePluginInstallState,
} from '../pluginState'
import { normalizePluginScope } from '../paths'
import { baseDirForInstallRecord, resolveInstalledPluginSpec } from './resolve'

export function disableSkillPlugin(
  pluginInput: string,
  options?: { scope?: PluginScope; project?: boolean },
): {
  pluginSpec: string
  disabledSkills: string[]
  disabledCommands: string[]
} {
  const requestedScope = normalizePluginScope(options)
  const state = ensurePluginInstallState()
  const pluginSpec = resolveInstalledPluginSpec(pluginInput, state)
  const record = state[pluginSpec]
  if (!record) throw new Error(`Plugin '${pluginSpec}' is not installed`)

  if (record.scope !== requestedScope) {
    throw new Error(
      `Plugin '${pluginSpec}' is installed with scope=${record.scope}. Re-run with --scope ${record.scope}.`,
    )
  }
  if (record.scope !== 'user') {
    const projectPath = record.projectPath?.trim() || ''
    const cwd = getCwd()
    if (!projectPath || projectPath !== cwd) {
      throw new Error(
        `Plugin '${pluginSpec}' is installed for a different directory. Expected cwd=${projectPath || '(missing)'}, got cwd=${cwd}`,
      )
    }
  }

  if (record.isEnabled === false) {
    return { pluginSpec, disabledSkills: [], disabledCommands: [] }
  }

  if (record.kind === 'plugin-pack') {
    record.isEnabled = false
    state[pluginSpec] = record
    savePluginInstallState(state)
    return { pluginSpec, disabledSkills: [], disabledCommands: [] }
  }

  const baseDir = baseDirForInstallRecord(record)
  const skillsDir = join(baseDir, 'skills')
  const commandsDir = join(
    baseDir,
    'commands',
    record.plugin,
    record.marketplace,
  )
  const disabledSkillsBase = join(
    baseDir,
    'skills.disabled',
    record.plugin,
    record.marketplace,
  )
  const disabledCommandsDir = join(
    baseDir,
    'commands.disabled',
    record.plugin,
    record.marketplace,
  )

  const disabledSkills: string[] = []
  for (const skillName of record.skills) {
    const src = join(skillsDir, skillName)
    if (!existsSync(src)) continue
    const dest = join(disabledSkillsBase, skillName)
    ensureDir(dirname(dest))
    if (existsSync(dest)) rmSync(dest, { recursive: true, force: true })
    renameSync(src, dest)
    disabledSkills.push(skillName)
  }

  const disabledCommands: string[] = []
  if (existsSync(commandsDir)) {
    ensureDir(dirname(disabledCommandsDir))
    if (existsSync(disabledCommandsDir)) {
      rmSync(disabledCommandsDir, { recursive: true, force: true })
    }
    renameSync(commandsDir, disabledCommandsDir)
    disabledCommands.push(disabledCommandsDir)
  }

  record.isEnabled = false
  state[pluginSpec] = record
  savePluginInstallState(state)

  return { pluginSpec, disabledSkills, disabledCommands }
}

export function enableSkillPlugin(
  pluginInput: string,
  options?: { scope?: PluginScope; project?: boolean },
): { pluginSpec: string; enabledSkills: string[]; enabledCommands: string[] } {
  const requestedScope = normalizePluginScope(options)
  const state = ensurePluginInstallState()
  const pluginSpec = resolveInstalledPluginSpec(pluginInput, state)
  const record = state[pluginSpec]
  if (!record) throw new Error(`Plugin '${pluginSpec}' is not installed`)

  if (record.scope !== requestedScope) {
    throw new Error(
      `Plugin '${pluginSpec}' is installed with scope=${record.scope}. Re-run with --scope ${record.scope}.`,
    )
  }
  if (record.scope !== 'user') {
    const projectPath = record.projectPath?.trim() || ''
    const cwd = getCwd()
    if (!projectPath || projectPath !== cwd) {
      throw new Error(
        `Plugin '${pluginSpec}' is installed for a different directory. Expected cwd=${projectPath || '(missing)'}, got cwd=${cwd}`,
      )
    }
  }

  if (record.isEnabled !== false) {
    return { pluginSpec, enabledSkills: [], enabledCommands: [] }
  }

  if (record.kind === 'plugin-pack') {
    record.isEnabled = true
    state[pluginSpec] = record
    savePluginInstallState(state)
    return { pluginSpec, enabledSkills: [], enabledCommands: [] }
  }

  const baseDir = baseDirForInstallRecord(record)
  const skillsDir = join(baseDir, 'skills')
  const commandsDir = join(
    baseDir,
    'commands',
    record.plugin,
    record.marketplace,
  )
  const disabledSkillsBase = join(
    baseDir,
    'skills.disabled',
    record.plugin,
    record.marketplace,
  )
  const disabledCommandsDir = join(
    baseDir,
    'commands.disabled',
    record.plugin,
    record.marketplace,
  )

  const enabledSkills: string[] = []
  for (const skillName of record.skills) {
    const src = join(disabledSkillsBase, skillName)
    if (!existsSync(src)) continue
    const dest = join(skillsDir, skillName)
    ensureDir(dirname(dest))
    if (existsSync(dest)) {
      throw new Error(`Destination already exists: ${dest}`)
    }
    renameSync(src, dest)
    enabledSkills.push(skillName)
  }

  const enabledCommands: string[] = []
  if (existsSync(disabledCommandsDir)) {
    ensureDir(dirname(commandsDir))
    if (existsSync(commandsDir)) {
      throw new Error(`Destination already exists: ${commandsDir}`)
    }
    renameSync(disabledCommandsDir, commandsDir)
    enabledCommands.push(commandsDir)
  }

  record.isEnabled = true
  state[pluginSpec] = record
  savePluginInstallState(state)

  return { pluginSpec, enabledSkills, enabledCommands }
}
