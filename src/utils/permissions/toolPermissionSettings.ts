import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import type {
  ToolPermissionContext,
  ToolPermissionContextUpdate,
  ToolPermissionRuleBehavior,
  ToolPermissionUpdateDestination,
} from '@kode-types/toolPermissionContext'
import {
  createDefaultToolPermissionContext,
  isPersistableToolPermissionDestination,
} from '@kode-types/toolPermissionContext'
import { getCurrentProjectConfig } from '@utils/config'
import { getCwd } from '@utils/state'
import { logError } from '@utils/log'

type ClaudeSettingsPermissions = {
  allow?: unknown
  deny?: unknown
  ask?: unknown
  additionalDirectories?: unknown
}

type ClaudeSettingsFile = {
  permissions?: ClaudeSettingsPermissions
  [key: string]: unknown
}

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') continue
    if (seen.has(item)) continue
    seen.add(item)
    out.push(item)
  }
  return out
}

export function getClaudeSettingsFilePath(options: {
  destination: ToolPermissionUpdateDestination
  projectDir?: string
  homeDir?: string
}): string | null {
  const projectDir = options.projectDir ?? getCwd()
  const homeDir = options.homeDir ?? homedir()

  switch (options.destination) {
    case 'localSettings':
      return join(projectDir, '.claude', 'settings.local.json')
    case 'projectSettings':
      return join(projectDir, '.claude', 'settings.json')
    case 'userSettings':
      return join(homeDir, '.claude', 'settings.json')
    default:
      return null
  }
}

export function readClaudeSettingsFile(filePath: string): ClaudeSettingsFile | null {
  if (!existsSync(filePath)) return null
  try {
    const raw = readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as ClaudeSettingsFile
  } catch (error) {
    logError(error)
    return null
  }
}

export function writeClaudeSettingsFile(filePath: string, settings: ClaudeSettingsFile): void {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, JSON.stringify(settings, null, 2) + '\n', 'utf-8')
}

export function loadToolPermissionContextFromDisk(options?: {
  projectDir?: string
  homeDir?: string
  includeKodeProjectConfig?: boolean
  isBypassPermissionsModeAvailable?: boolean
}): ToolPermissionContext {
  const projectDir = options?.projectDir ?? getCwd()
  const homeDir = options?.homeDir ?? homedir()
  const includeKodeProjectConfig = options?.includeKodeProjectConfig ?? true

  const base = createDefaultToolPermissionContext({
    isBypassPermissionsModeAvailable:
      options?.isBypassPermissionsModeAvailable ?? false,
  })

  const sources: Array<{
    destination: ToolPermissionUpdateDestination
    filePath: string
  }> = [
    {
      destination: 'userSettings',
      filePath: join(homeDir, '.claude', 'settings.json'),
    },
    {
      destination: 'projectSettings',
      filePath: join(projectDir, '.claude', 'settings.json'),
    },
    {
      destination: 'localSettings',
      filePath: join(projectDir, '.claude', 'settings.local.json'),
    },
  ]

  for (const source of sources) {
    const settings = readClaudeSettingsFile(source.filePath)
    const perms = settings?.permissions
    const allow = uniqueStrings(perms?.allow)
    const deny = uniqueStrings(perms?.deny)
    const ask = uniqueStrings(perms?.ask)
    const additionalDirectories = uniqueStrings(perms?.additionalDirectories)

    if (allow.length > 0) base.alwaysAllowRules[source.destination] = allow
    if (deny.length > 0) base.alwaysDenyRules[source.destination] = deny
    if (ask.length > 0) base.alwaysAskRules[source.destination] = ask

    for (const dir of additionalDirectories) {
      base.additionalWorkingDirectories.set(dir, {
        path: dir,
        source: source.destination,
      })
    }
  }

  if (includeKodeProjectConfig) {
    try {
      const cfg = getCurrentProjectConfig()
      const allow = Array.isArray(cfg.allowedTools) ? cfg.allowedTools : []
      const deny = Array.isArray((cfg as any).deniedTools) ? (cfg as any).deniedTools : []
      const ask = Array.isArray((cfg as any).askedTools) ? (cfg as any).askedTools : []

      if (allow.length > 0) {
        const prev = base.alwaysAllowRules.localSettings ?? []
        base.alwaysAllowRules.localSettings = [...new Set([...prev, ...allow])]
      }
      if (deny.length > 0) {
        const prev = base.alwaysDenyRules.localSettings ?? []
        base.alwaysDenyRules.localSettings = [...new Set([...prev, ...deny])]
      }
      if (ask.length > 0) {
        const prev = base.alwaysAskRules.localSettings ?? []
        base.alwaysAskRules.localSettings = [...new Set([...prev, ...ask])]
      }
    } catch (error) {
      logError(error)
    }
  }

  return base
}

function getOrCreatePermissions(settings: ClaudeSettingsFile): Required<ClaudeSettingsFile>['permissions'] {
  const existing = settings.permissions
  if (existing && typeof existing === 'object') {
    return existing as ClaudeSettingsPermissions
  }
  settings.permissions = {}
  return settings.permissions as ClaudeSettingsPermissions
}

function behaviorKey(behavior: ToolPermissionRuleBehavior): keyof ClaudeSettingsPermissions {
  switch (behavior) {
    case 'allow':
      return 'allow'
    case 'deny':
      return 'deny'
    case 'ask':
      return 'ask'
  }
}

export function persistToolPermissionUpdateToDisk(options: {
  update: ToolPermissionContextUpdate
  projectDir?: string
  homeDir?: string
}): { persisted: boolean } {
  const update = options.update
  if (!isPersistableToolPermissionDestination(update.destination)) {
    return { persisted: false }
  }
  if (update.type === 'setMode') {
    return { persisted: false }
  }

  const filePath = getClaudeSettingsFilePath({
    destination: update.destination,
    projectDir: options.projectDir,
    homeDir: options.homeDir,
  })
  if (!filePath) return { persisted: false }

  const existing = readClaudeSettingsFile(filePath) ?? {}
  const permissions = getOrCreatePermissions(existing)

  try {
    switch (update.type) {
      case 'addRules':
      case 'replaceRules':
      case 'removeRules': {
        const key = behaviorKey(update.behavior)
        const current = uniqueStrings(permissions[key])

        if (update.type === 'addRules') {
          const merged = [...new Set([...current, ...update.rules])]
          permissions[key] = merged
        } else if (update.type === 'replaceRules') {
          permissions[key] = uniqueStrings(update.rules)
        } else {
          const toRemove = new Set(update.rules)
          permissions[key] = current.filter(rule => !toRemove.has(rule))
        }
        break
      }
      case 'addDirectories':
      case 'removeDirectories': {
        const current = uniqueStrings(permissions.additionalDirectories)
        if (update.type === 'addDirectories') {
          permissions.additionalDirectories = [
            ...new Set([...current, ...update.directories]),
          ]
        } else {
          const toRemove = new Set(update.directories)
          permissions.additionalDirectories = current.filter(
            dir => !toRemove.has(dir),
          )
        }
        break
      }
      default:
        return { persisted: false }
    }

    writeClaudeSettingsFile(filePath, existing)
    return { persisted: true }
  } catch (error) {
    logError(error)
    return { persisted: false }
  }
}

