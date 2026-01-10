import { ensureDir } from './fsUtils'
import { readJsonFile, writeJsonFile } from './json'
import { installedSkillPluginsPath, userKodeDir } from './paths'
import type { InstalledSkillPluginsFile } from './types'

export function ensurePluginInstallState(): InstalledSkillPluginsFile {
  ensureDir(userKodeDir())
  const state = readJsonFile<Record<string, any>>(
    installedSkillPluginsPath(),
    {},
  )
  for (const record of Object.values(state)) {
    if (!record || typeof record !== 'object') continue
    if (
      record.scope !== 'user' &&
      record.scope !== 'project' &&
      record.scope !== 'local'
    ) {
      record.scope = 'user'
    }
    if (record.kind !== 'skill-pack' && record.kind !== 'plugin-pack') {
      record.kind =
        typeof record.pluginRoot === 'string' ? 'plugin-pack' : 'skill-pack'
    }
    if (record.isEnabled === undefined) record.isEnabled = true
  }
  return state as InstalledSkillPluginsFile
}

export function savePluginInstallState(state: InstalledSkillPluginsFile): void {
  writeJsonFile(installedSkillPluginsPath(), state)
}

export function listInstalledSkillPlugins(): InstalledSkillPluginsFile {
  return ensurePluginInstallState()
}
