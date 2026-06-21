import { existsSync, lstatSync } from 'node:fs'
import { join } from 'node:path'

import { getCwd } from '#core/utils/state'

import { ensurePluginInstallState } from '../pluginState'
import { baseDirForInstallRecord } from './resolve'

export function listEnabledInstalledPluginPackRoots(): string[] {
  const state = ensurePluginInstallState()
  const cwd = getCwd()
  const roots: string[] = []

  for (const spec of Object.keys(state).sort()) {
    const record = state[spec]
    if (!record || record.kind !== 'plugin-pack') continue
    if (record.isEnabled === false) continue

    if (record.scope !== 'user') {
      const projectPath = record.projectPath?.trim() || ''
      if (!projectPath || projectPath !== cwd) continue
    }

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

    try {
      if (!existsSync(pluginRoot) || !lstatSync(pluginRoot).isDirectory()) {
        continue
      }
      roots.push(pluginRoot)
    } catch {
      continue
    }
  }

  return roots
}
