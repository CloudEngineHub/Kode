import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { memoize } from 'lodash-es'

import { getCwd } from '#core/utils/state'
import { getSessionPlugins } from '#core/utils/sessionPlugins'
import { getKodeBaseDir } from '#core/utils/env'
import { debug as debugLogger } from '#core/utils/debugLogger'
import { logError } from '#core/utils/log'

import type { CustomCommandWithScope } from './types'
import {
  applySkillFilePreference,
  createPromptCommandFromFile,
  loadCommandMarkdownFilesFromBaseDir,
  loadSkillDirectoryCommandsFromBaseDir,
} from './discovery'
import {
  loadPluginCommandsFromDir,
  loadPluginSkillDirectoryCommandsFromBaseDir,
} from './pluginLoader'

function getUserKodeBaseDir(): string {
  return getKodeBaseDir()
}

export const loadCustomCommands = memoize(
  async (): Promise<CustomCommandWithScope[]> => {
    const cwd = getCwd()
    const userKodeBaseDir = getUserKodeBaseDir()
    const sessionPlugins = getSessionPlugins()

    const projectLegacyCommandsDir = join(cwd, '.claude', 'commands')
    const userLegacyCommandsDir = join(homedir(), '.claude', 'commands')
    const projectKodeCommandsDir = join(cwd, '.kode', 'commands')
    const userKodeCommandsDir = join(userKodeBaseDir, 'commands')

    const projectLegacySkillsDir = join(cwd, '.claude', 'skills')
    const userLegacySkillsDir = join(homedir(), '.claude', 'skills')
    const projectKodeSkillsDir = join(cwd, '.kode', 'skills')
    const userKodeSkillsDir = join(userKodeBaseDir, 'skills')

    const abortController = new AbortController()
    const timeout = setTimeout(() => abortController.abort(), 3000)

    try {
      const commandFiles = applySkillFilePreference([
        ...loadCommandMarkdownFilesFromBaseDir(
          projectLegacyCommandsDir,
          'localSettings',
          'project',
          abortController.signal,
        ),
        ...loadCommandMarkdownFilesFromBaseDir(
          projectKodeCommandsDir,
          'localSettings',
          'project',
          abortController.signal,
        ),
        ...loadCommandMarkdownFilesFromBaseDir(
          userLegacyCommandsDir,
          'userSettings',
          'user',
          abortController.signal,
        ),
        ...loadCommandMarkdownFilesFromBaseDir(
          userKodeCommandsDir,
          'userSettings',
          'user',
          abortController.signal,
        ),
      ])

      const fileCommands = commandFiles
        .map(createPromptCommandFromFile)
        .filter((cmd): cmd is CustomCommandWithScope => cmd !== null)

      const skillDirCommands: CustomCommandWithScope[] = [
        ...loadSkillDirectoryCommandsFromBaseDir(
          projectLegacySkillsDir,
          'localSettings',
          'project',
        ),
        ...loadSkillDirectoryCommandsFromBaseDir(
          projectKodeSkillsDir,
          'localSettings',
          'project',
        ),
        ...loadSkillDirectoryCommandsFromBaseDir(
          userLegacySkillsDir,
          'userSettings',
          'user',
        ),
        ...loadSkillDirectoryCommandsFromBaseDir(
          userKodeSkillsDir,
          'userSettings',
          'user',
        ),
      ]

      const pluginCommands: CustomCommandWithScope[] = []
      if (sessionPlugins.length > 0) {
        for (const plugin of sessionPlugins) {
          for (const commandsDir of plugin.commandsDirs) {
            pluginCommands.push(
              ...loadPluginCommandsFromDir({
                pluginName: plugin.name,
                commandsDir,
                signal: abortController.signal,
              }),
            )
          }
          for (const skillsDir of plugin.skillsDirs) {
            pluginCommands.push(
              ...loadPluginSkillDirectoryCommandsFromBaseDir({
                pluginName: plugin.name,
                skillsDir,
              }),
            )
          }
        }
      }

      const ordered = [
        ...fileCommands,
        ...skillDirCommands,
        ...pluginCommands,
      ].filter(cmd => cmd.isEnabled)

      const seen = new Set<string>()
      const unique: CustomCommandWithScope[] = []
      for (const cmd of ordered) {
        const key = cmd.userFacingName()
        if (seen.has(key)) continue
        seen.add(key)
        unique.push(cmd)
      }

      return unique
    } catch (error) {
      logError(error)
      debugLogger.warn('CUSTOM_COMMANDS_LOAD_FAILED', {
        error: error instanceof Error ? error.message : String(error),
      })
      return []
    } finally {
      clearTimeout(timeout)
    }
  },
  () => {
    const cwd = getCwd()
    const userKodeBaseDir = getUserKodeBaseDir()
    const dirs = [
      join(homedir(), '.claude', 'commands'),
      join(cwd, '.claude', 'commands'),
      join(userKodeBaseDir, 'commands'),
      join(cwd, '.kode', 'commands'),
      join(homedir(), '.claude', 'skills'),
      join(cwd, '.claude', 'skills'),
      join(userKodeBaseDir, 'skills'),
      join(cwd, '.kode', 'skills'),
    ]
    const exists = dirs.map(d => (existsSync(d) ? '1' : '0')).join('')
    return `${cwd}:${exists}:${Math.floor(Date.now() / 60000)}`
  },
)

export const reloadCustomCommands = (): void => {
  loadCustomCommands.cache.clear()
}

export function getCustomCommandDirectories(): {
  userClaudeCommands: string
  projectClaudeCommands: string
  userClaudeSkills: string
  projectClaudeSkills: string
  userKodeCommands: string
  projectKodeCommands: string
  userKodeSkills: string
  projectKodeSkills: string
} {
  const userKodeBaseDir = getUserKodeBaseDir()
  return {
    userClaudeCommands: join(homedir(), '.claude', 'commands'),
    projectClaudeCommands: join(getCwd(), '.claude', 'commands'),
    userClaudeSkills: join(homedir(), '.claude', 'skills'),
    projectClaudeSkills: join(getCwd(), '.claude', 'skills'),
    userKodeCommands: join(userKodeBaseDir, 'commands'),
    projectKodeCommands: join(getCwd(), '.kode', 'commands'),
    userKodeSkills: join(userKodeBaseDir, 'skills'),
    projectKodeSkills: join(getCwd(), '.kode', 'skills'),
  }
}

export function hasCustomCommands(): boolean {
  const dirs = getCustomCommandDirectories()
  return (
    existsSync(dirs.userClaudeCommands) ||
    existsSync(dirs.projectClaudeCommands) ||
    existsSync(dirs.userClaudeSkills) ||
    existsSync(dirs.projectClaudeSkills) ||
    existsSync(dirs.userKodeCommands) ||
    existsSync(dirs.projectKodeCommands) ||
    existsSync(dirs.userKodeSkills) ||
    existsSync(dirs.projectKodeSkills)
  )
}
