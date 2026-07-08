import { existsSync, watch, type FSWatcher } from 'fs'
import { stat } from 'fs/promises'
import { join } from 'path'

import { LRUCache } from 'lru-cache'
import { memoize } from 'lodash-es'

import { getCwd } from '#core/utils/state'
import { getSessionPlugins } from '#core/utils/sessionPlugins'
import { isSettingSourceEnabled, resolveDataRoots } from '#config'
import { debug as debugLogger } from '#core/utils/debugLogger'
import { logError } from '#core/utils/log'
import { LEGACY_CONFIG_SUBDIRS } from '#core/compat/legacyPaths'

import { BUILTIN_AGENTS } from './builtin'
import type { AgentConfig, AgentSource } from './types'
import {
  dedupeStrings,
  findProjectAgentDirs,
  getPolicyBaseDirs,
  listMarkdownFilesRecursively,
} from './storage'
import {
  parseAgentFromFileAsync,
  parseFlagAgentsFromCliJson,
} from './validator'
import { emitAgentReloaded } from './events'

let FLAG_AGENTS: AgentConfig[] = []

type AgentFileCacheEntry = {
  mtimeMs: number
  size: number
  agent: AgentConfig | null
}

const AGENT_FILE_CACHE = new LRUCache<string, AgentFileCacheEntry>({ max: 512 })
let agentFileCacheHits = 0
let agentFileCacheMisses = 0

function getAgentFileCacheKey(options: {
  filePath: string
  baseDir: string
  source: Exclude<AgentSource, 'built-in' | 'flagSettings'>
}): string {
  return `${options.filePath}::${options.baseDir}::${options.source}`
}

async function parseAgentFromFileCached(options: {
  filePath: string
  baseDir: string
  source: Exclude<AgentSource, 'built-in' | 'flagSettings'>
}): Promise<AgentConfig | null> {
  let st: Awaited<ReturnType<typeof stat>>
  try {
    st = await stat(options.filePath)
  } catch {
    return null
  }

  if (!st.isFile()) return null

  const key = getAgentFileCacheKey(options)
  const cached = AGENT_FILE_CACHE.get(key)
  if (cached && cached.mtimeMs === st.mtimeMs && cached.size === st.size) {
    agentFileCacheHits += 1
    return cached.agent
  }

  agentFileCacheMisses += 1
  const agent = await parseAgentFromFileAsync(options)
  AGENT_FILE_CACHE.set(key, { mtimeMs: st.mtimeMs, size: st.size, agent })
  return agent
}

function invalidateAgentFileCacheForPath(filePath: string): void {
  const prefix = `${filePath}::`
  for (const key of [...AGENT_FILE_CACHE.keys()]) {
    if (key.startsWith(prefix)) {
      AGENT_FILE_CACHE.delete(key)
    }
  }
}

export function __getAgentFileCacheStatsForTests(): {
  hits: number
  misses: number
  size: number
} {
  return {
    hits: agentFileCacheHits,
    misses: agentFileCacheMisses,
    size: AGENT_FILE_CACHE.size,
  }
}

export function __resetAgentFileCacheStatsForTests(): void {
  agentFileCacheHits = 0
  agentFileCacheMisses = 0
  AGENT_FILE_CACHE.clear()
}

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

  const active = Array.from(map.values())
  active.sort((a, b) =>
    a.agentType.localeCompare(b.agentType, undefined, { sensitivity: 'base' }),
  )
  return active
}

async function scanAgentPaths(options: {
  dirPathOrFile: string
  baseDir: string
  source: Exclude<AgentSource, 'built-in' | 'flagSettings'>
}): Promise<AgentConfig[]> {
  const out: AgentConfig[] = []

  const addFile = async (filePath: string) => {
    if (!filePath.endsWith('.md')) return

    const agent = await parseAgentFromFileCached({
      filePath,
      baseDir: options.baseDir,
      source: options.source,
    })
    if (agent) out.push(agent)
  }

  let st: Awaited<ReturnType<typeof stat>>
  try {
    st = await stat(options.dirPathOrFile)
  } catch {
    return []
  }

  if (st.isFile()) {
    await addFile(options.dirPathOrFile)
    return out
  }

  if (!st.isDirectory()) return []

  const files = await listMarkdownFilesRecursively(options.dirPathOrFile)
  for (const filePath of files) {
    await addFile(filePath)
  }

  return out
}

async function loadAllAgents(): Promise<{
  activeAgents: AgentConfig[]
  allAgents: AgentConfig[]
}> {
  // Plugins (session-scoped)
  const sessionPlugins = getSessionPlugins()
  const pluginAgentDirs = dedupeStrings(
    sessionPlugins.flatMap(p => p.agentsDirs ?? []),
  )
  const pluginAgents = (
    await Promise.all(
      pluginAgentDirs.map(dir =>
        scanAgentPaths({
          dirPathOrFile: dir,
          baseDir: dir,
          source: 'plugin',
        }),
      ),
    )
  ).flat()

  // Policy
  const policyAgentDirs = getPolicyBaseDirs().flatMap(baseDir => [
    // Legacy format scanned first so Kode wins when both define the same agentType.
    join(baseDir, LEGACY_CONFIG_SUBDIRS.agents),
    join(baseDir, '.kode', 'agents'),
  ])
  const policyAgents = (
    await Promise.all(
      policyAgentDirs.map(dir =>
        scanAgentPaths({
          dirPathOrFile: dir,
          baseDir: dir,
          source: 'policySettings',
        }),
      ),
    )
  ).flat()

  // User
  const userAgents: AgentConfig[] = []
  if (isSettingSourceEnabled('userSettings')) {
    const roots = resolveDataRoots()
    const legacyRoots = [...roots.claudeCompatRoots].reverse()
    const userAgentDirs = [
      ...legacyRoots.map(root => join(root, 'agents')),
      join(roots.kodeRoot, 'agents'),
    ]

    const scanned = await Promise.all(
      userAgentDirs.map(dir =>
        scanAgentPaths({
          dirPathOrFile: dir,
          baseDir: dir,
          source: 'userSettings',
        }),
      ),
    )
    for (const agents of scanned) userAgents.push(...agents)
  }

  // Project
  const projectAgents: AgentConfig[] = []
  if (isSettingSourceEnabled('projectSettings')) {
    const dirs = findProjectAgentDirs(getCwd())
    const scanned = await Promise.all(
      dirs.map(dir =>
        scanAgentPaths({
          dirPathOrFile: dir,
          baseDir: dir,
          source: 'projectSettings',
        }),
      ),
    )
    for (const agents of scanned) projectAgents.push(...agents)
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
const AGENT_WATCH_DEBOUNCE_MS = 200
let pendingWatchReloadTimer: ReturnType<typeof setTimeout> | null = null
let pendingWatchReloadPaths = new Set<string>()
let pendingWatchReloadOnChange: (() => void) | undefined

export async function startAgentWatcher(onChange?: () => void): Promise<void> {
  await stopAgentWatcher()
  pendingWatchReloadOnChange = onChange

  const watchDirs: string[] = []

  // Policy
  {
    for (const baseDir of getPolicyBaseDirs()) {
      watchDirs.push(join(baseDir, '.kode', 'agents'))
      watchDirs.push(join(baseDir, LEGACY_CONFIG_SUBDIRS.agents))
    }
  }

  // User
  if (isSettingSourceEnabled('userSettings')) {
    const roots = resolveDataRoots()
    watchDirs.push(join(roots.kodeRoot, 'agents'))
    for (const root of roots.claudeCompatRoots) {
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
          const scheduleReload = () => {
            if (pendingWatchReloadTimer) {
              clearTimeout(pendingWatchReloadTimer)
            }
            pendingWatchReloadTimer = setTimeout(() => {
              pendingWatchReloadTimer = null
              const changedPaths = Array.from(pendingWatchReloadPaths)
              pendingWatchReloadPaths.clear()
              clearAgentCache()
              pendingWatchReloadOnChange?.()
              emitAgentReloaded({ changedPaths })
            }, AGENT_WATCH_DEBOUNCE_MS)
          }

          // Some platforms may not provide a filename. Fail open and reload agents anyway.
          if (!filename) {
            scheduleReload()
            return
          }

          if (!filename.endsWith('.md')) return

          try {
            const fullPath = join(dirPath, filename)
            invalidateAgentFileCacheForPath(fullPath)
            pendingWatchReloadPaths.add(fullPath)
          } catch {
            // ignore best-effort invalidation
          }

          scheduleReload()
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
    if (pendingWatchReloadTimer) {
      clearTimeout(pendingWatchReloadTimer)
      pendingWatchReloadTimer = null
    }
    pendingWatchReloadPaths.clear()
    pendingWatchReloadOnChange = undefined
  }
}
