import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { getCwd } from '#core/utils/state'

import type { PluginScope } from '../types'
import {
  ensurePluginInstallState,
  savePluginInstallState,
} from '../pluginState'
import { normalizePluginScope } from '../paths'
import { baseDirForInstallRecord, resolveInstalledPluginSpec } from './resolve'

export function uninstallSkillPlugin(
  pluginInput: string,
  options?: { scope?: PluginScope; project?: boolean },
): { pluginSpec: string; removedSkills: string[]; removedCommands: string[] } {
  const requestedScope = normalizePluginScope(options)
  const state = ensurePluginInstallState()
  const pluginSpec = resolveInstalledPluginSpec(pluginInput, state)
  const record = state[pluginSpec]
  if (!record) {
    throw new Error(`Plugin '${pluginSpec}' is not installed`)
  }

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

  if (record.kind === 'plugin-pack') {
    const baseDir = baseDirForInstallRecord(record)
    const pluginRoot =
      typeof record.pluginRoot === 'string' && record.pluginRoot.trim()
        ? record.pluginRoot
        : join(
            baseDir,
            'plugins',
            'installed',
            record.plugin,
            record.marketplace,
          )

    const removedCommands: string[] = []
    if (existsSync(pluginRoot)) {
      rmSync(pluginRoot, { recursive: true, force: true })
      removedCommands.push(pluginRoot)
    }

    delete state[pluginSpec]
    savePluginInstallState(state)

    return { pluginSpec, removedSkills: [], removedCommands }
  }

  const baseDir = baseDirForInstallRecord(record)
  const skillsDestBase = join(baseDir, 'skills')
  const commandsDestBase = join(
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
  const disabledCommandsBase = join(
    baseDir,
    'commands.disabled',
    record.plugin,
    record.marketplace,
  )

  const removedSkills: string[] = []
  for (const skillName of record.skills) {
    const dest = join(skillsDestBase, skillName)
    if (existsSync(dest)) rmSync(dest, { recursive: true, force: true })
    const disabledDest = join(disabledSkillsBase, skillName)
    if (existsSync(disabledDest)) {
      rmSync(disabledDest, { recursive: true, force: true })
    }
    removedSkills.push(skillName)
  }

  const removedCommands: string[] = []
  if (existsSync(commandsDestBase)) {
    rmSync(commandsDestBase, { recursive: true, force: true })
    removedCommands.push(commandsDestBase)
  }
  if (existsSync(disabledCommandsBase)) {
    rmSync(disabledCommandsBase, { recursive: true, force: true })
    removedCommands.push(disabledCommandsBase)
  }

  delete state[pluginSpec]
  savePluginInstallState(state)

  return { pluginSpec, removedSkills, removedCommands }
}
