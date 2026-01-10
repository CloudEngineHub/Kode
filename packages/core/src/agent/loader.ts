import { existsSync, statSync, watch, type FSWatcher } from 'fs'
import { join } from 'path'

import { memoize } from 'lodash-es'

import { getCwd } from '#core/utils/state'
import { getSessionPlugins } from '#core/utils/sessionPlugins'
import { isSettingSourceEnabled } from '#config'
import { debug as debugLogger } from '#core/utils/debugLogger'
import { logError } from '#core/utils/log'

import { BUILTIN_AGENTS } from './builtin'
import type { AgentConfig, AgentSource } from './types'
import {
  dedupeStrings,
  findProjectAgentDirs,
  getClaudePolicyBaseDir,
  getUserConfigRoots,
  listMarkdownFilesRecursively,
} from './storage'
import { parseAgentFromFile, parseFlagAgentsFromCliJson } from './validator'

let FLAG_AGENTS: AgentConfig[] = []

export function setFlagAgentsFromCliJson(json: string | undefined): void {
  if (!json) {
    FLAG_AGENTS = []
    clearAgentCache()
    return
  }

  FLAG_AGENTS = parseFlagAgentsFromCliJson(json)
  clearAgentCache()
}

function mergeAgents(allAgents: AgentConfig[]): AgentConfig[] {
  const builtIn = allAgents.filter(a => a.source === 'built-in')
  const plugin = allAgents.filter(a => a.source === 'plugin')
  const user = allAgents.filter(a => a.source === 'userSettings')
  const project = allAgents.filter(a => a.source === 'projectSettings')
  const flag = allAgents.filter(a => a.source === 'flagSettings')
  const policy = allAgents.filter(a => a.source === 'policySettings')

  const ordered = [builtIn, plugin, user, project, flag, policy]
  const map = new Map<string, AgentConfig>()
  for (const group of ordered) {
    for (const agent of group) {
      map.set(agent.agentType, agent)
    }
  }
  return Array.from(map.values())
}

function inodeKeyForPath(filePath: string): string | null {
  try {
    const st = statSync(filePath)
    return `${st.dev}:${st.ino}`
  } catch {
    return null
  }
}

function scanAgentPaths(options: {
  dirPathOrFile: string
  baseDir: string
  source: Exclude<AgentSource, 'built-in' | 'flagSettings'>
  seenInodes: Map<string, AgentSource>
}): AgentConfig[] {
  const out: AgentConfig[] = []

  const addFile = (filePath: string) => {
    if (!filePath.endsWith('.md')) return

    const inodeKey = inodeKeyForPath(filePath)
    if (inodeKey) {
      const existing = options.seenInodes.get(inodeKey)
      if (existing) return
      options.seenInodes.set(inodeKey, options.source)
    }

    const agent = parseAgentFromFile({
      filePath,
      baseDir: options.baseDir,
      source: options.source,
    })
    if (agent) out.push(agent)
  }

  let st: ReturnType<typeof statSync>
  try {
    st = statSync(options.dirPathOrFile)
  } catch {
    return []
  }

  if (st.isFile()) {
    addFile(options.dirPathOrFile)
    return out
  }

  if (!st.isDirectory()) return []

  for (const filePath of listMarkdownFilesRecursively(options.dirPathOrFile)) {
    addFile(filePath)
  }

  return out
}

async function loadAllAgents(): Promise<{
  activeAgents: AgentConfig[]
  allAgents: AgentConfig[]
}> {
  const seenInodes = new Map<string, AgentSource>()

  // Plugins
  const sessionPlugins = getSessionPlugins()
  const pluginAgentDirs = sessionPlugins.flatMap(p => p.agentsDirs ?? [])
  const pluginAgents = pluginAgentDirs.flatMap(dir =>
    scanAgentPaths({
      dirPathOrFile: dir,
      baseDir: dir,
      source: 'plugin',
      seenInodes,
    }),
  )

  // Policy
  const policyAgentsDir = join(getClaudePolicyBaseDir(), '.claude', 'agents')
  const policyAgents = scanAgentPaths({
    dirPathOrFile: policyAgentsDir,
    baseDir: policyAgentsDir,
    source: 'policySettings',
    seenInodes,
  })

  // User
  const userAgents: AgentConfig[] = []
  if (isSettingSourceEnabled('userSettings')) {
    for (const root of getUserConfigRoots()) {
      const dir = join(root, 'agents')
      userAgents.push(
        ...scanAgentPaths({
          dirPathOrFile: dir,
          baseDir: dir,
          source: 'userSettings',
          seenInodes,
        }),
      )
    }
  }

  // Project
  const projectAgents: AgentConfig[] = []
  if (isSettingSourceEnabled('projectSettings')) {
    const dirs = findProjectAgentDirs(getCwd())
    for (const dir of dirs) {
      projectAgents.push(
        ...scanAgentPaths({
          dirPathOrFile: dir,
          baseDir: dir,
          source: 'projectSettings',
          seenInodes,
        }),
      )
    }
  }

  const allAgents: AgentConfig[] = [
    ...BUILTIN_AGENTS,
    ...pluginAgents,
    ...userAgents,
    ...projectAgents,
    ...FLAG_AGENTS,
    ...policyAgents,
  ]

  const activeAgents = mergeAgents(allAgents)
  return { activeAgents, allAgents }
}

export const getActiveAgents = memoize(async (): Promise<AgentConfig[]> => {
  const { activeAgents } = await loadAllAgents()
  return activeAgents
})

export const getAllAgents = memoize(async (): Promise<AgentConfig[]> => {
  const { allAgents } = await loadAllAgents()
  return allAgents
})

export const getAgentByType = memoize(
  async (agentType: string): Promise<AgentConfig | undefined> => {
    const agents = await getActiveAgents()
    return agents.find(agent => agent.agentType === agentType)
  },
)

export const getAvailableAgentTypes = memoize(async (): Promise<string[]> => {
  const agents = await getActiveAgents()
  return agents.map(agent => agent.agentType)
})

export function clearAgentCache(): void {
  getActiveAgents.cache?.clear?.()
  getAllAgents.cache?.clear?.()
  getAgentByType.cache?.clear?.()
  getAvailableAgentTypes.cache?.clear?.()
}

let watchers: FSWatcher[] = []

export async function startAgentWatcher(onChange?: () => void): Promise<void> {
  await stopAgentWatcher()

  const watchDirs: string[] = []

  // Policy
  watchDirs.push(join(getClaudePolicyBaseDir(), '.claude', 'agents'))

  // User
  if (isSettingSourceEnabled('userSettings')) {
    for (const root of getUserConfigRoots()) {
      watchDirs.push(join(root, 'agents'))
    }
  }

  // Project
  if (isSettingSourceEnabled('projectSettings')) {
    watchDirs.push(...findProjectAgentDirs(getCwd()))
  }

  // Plugins (session-scoped)
  for (const plugin of getSessionPlugins()) {
    for (const dir of plugin.agentsDirs ?? []) {
      watchDirs.push(dir)
    }
  }

  for (const dirPath of dedupeStrings(watchDirs)) {
    if (!existsSync(dirPath)) continue
    try {
      const watcher = watch(
        dirPath,
        { recursive: false },
        (_eventType, filename) => {
          if (filename && filename.endsWith('.md')) {
            clearAgentCache()
            onChange?.()
          }
        },
      )
      watchers.push(watcher)
    } catch (err) {
      logError(err)
      debugLogger.warn('AGENT_LOADER_WATCH_FAILED', {
        dirPath,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
}

export async function stopAgentWatcher(): Promise<void> {
  try {
    for (const watcher of watchers) {
      try {
        watcher.close()
      } catch {
        // ignore
      }
    }
  } finally {
    watchers = []
  }
}
