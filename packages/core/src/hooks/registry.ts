import { readFileSync, statSync } from 'fs'
import { minimatch } from 'minimatch'

import { loadSettingsWithLegacyFallback } from '#config'
import { logError } from '#core/utils/log'
import { getSessionPlugins } from '#core/utils/sessionPlugins'

import type {
  CommandHook,
  Hook,
  HookEventName,
  HookFileEnvelope,
  HookMatcher,
  PromptHook,
  SettingsFileWithHooks,
} from './types'
import { asRecord } from './types'

type CachedHooks = {
  mtimeMs: number
  byEvent: Partial<Record<HookEventName, HookMatcher[]>>
}

const settingsHooksCache = new Map<string, CachedHooks>()
const pluginHooksCache = new Map<string, CachedHooks>()

function isCommandHook(value: unknown): value is CommandHook {
  const record = asRecord(value)
  if (!record) return false
  if (record.type !== 'command') return false
  const command = record.command
  return typeof command === 'string' && Boolean(command.trim())
}

function isPromptHook(value: unknown): value is PromptHook {
  const record = asRecord(value)
  if (!record) return false
  if (record.type !== 'prompt') return false
  const prompt = record.prompt
  return typeof prompt === 'string' && Boolean(prompt.trim())
}

function isHook(value: unknown): value is Hook {
  return isCommandHook(value) || isPromptHook(value)
}

function parseHookMatchers(value: unknown): HookMatcher[] {
  if (!Array.isArray(value)) return []

  const out: HookMatcher[] = []
  for (const item of value) {
    const record = asRecord(item)
    if (!record) continue
    const matcher =
      typeof record.matcher === 'string' ? record.matcher.trim() : ''
    const effectiveMatcher = matcher || '*'
    const hooksRaw = record.hooks
    const hooks = Array.isArray(hooksRaw) ? hooksRaw.filter(isHook) : []
    if (hooks.length === 0) continue
    out.push({ matcher: effectiveMatcher, hooks })
  }
  return out
}

function parseHooksByEvent(
  rawHooks: unknown,
): Partial<Record<HookEventName, HookMatcher[]>> {
  const hooks = asRecord(rawHooks)
  if (!hooks || Array.isArray(rawHooks)) return {}
  return {
    PreToolUse: parseHookMatchers(hooks.PreToolUse),
    PostToolUse: parseHookMatchers(hooks.PostToolUse),
    Stop: parseHookMatchers(hooks.Stop),
    SubagentStop: parseHookMatchers(hooks.SubagentStop),
    UserPromptSubmit: parseHookMatchers(hooks.UserPromptSubmit),
    SessionStart: parseHookMatchers(hooks.SessionStart),
    SessionEnd: parseHookMatchers(hooks.SessionEnd),
  }
}

function loadInlinePluginHooksByEvent(plugin: {
  manifestPath: string
  manifest: unknown
}): Partial<Record<HookEventName, HookMatcher[]>> | null {
  const manifest = asRecord(plugin.manifest)
  const manifestHooks = manifest?.hooks
  if (
    !manifestHooks ||
    typeof manifestHooks !== 'object' ||
    Array.isArray(manifestHooks)
  )
    return null

  const manifestHooksRecord = asRecord(manifestHooks)
  if (!manifestHooksRecord) return null
  const nestedHooks =
    manifestHooksRecord.hooks &&
    typeof manifestHooksRecord.hooks === 'object' &&
    !Array.isArray(manifestHooksRecord.hooks)
      ? asRecord(manifestHooksRecord.hooks)
      : null
  const hookObj = nestedHooks ?? manifestHooksRecord

  const cacheKey = `${plugin.manifestPath}#inlineHooks`
  try {
    const stat = statSync(plugin.manifestPath)
    const cached = pluginHooksCache.get(cacheKey)
    if (cached && cached.mtimeMs === stat.mtimeMs) return cached.byEvent

    const byEvent = parseHooksByEvent(hookObj)
    pluginHooksCache.set(cacheKey, { mtimeMs: stat.mtimeMs, byEvent })
    return byEvent
  } catch (err) {
    logError(err)
    pluginHooksCache.delete(cacheKey)
    return null
  }
}

export function loadSettingsMatchers(
  projectDir: string,
  event: HookEventName,
): HookMatcher[] {
  const loaded = loadSettingsWithLegacyFallback({
    destination: 'projectSettings',
    projectDir,
    migrateToPrimary: true,
  })
  const settingsPath = loaded.usedPath
  if (!settingsPath) return []
  try {
    const stat = statSync(settingsPath)
    const cached = settingsHooksCache.get(settingsPath)
    if (cached && cached.mtimeMs === stat.mtimeMs)
      return cached.byEvent[event] ?? []

    const parsed = loaded.settings as SettingsFileWithHooks | null
    const byEvent = parseHooksByEvent(parsed?.hooks)
    settingsHooksCache.set(settingsPath, { mtimeMs: stat.mtimeMs, byEvent })
    return byEvent[event] ?? []
  } catch {
    settingsHooksCache.delete(settingsPath)
    return []
  }
}

export function matcherMatchesTool(matcher: string, toolName: string): boolean {
  if (!matcher) return false
  if (matcher === '*' || matcher === 'all') return true
  if (matcher === toolName) return true
  try {
    if (minimatch(toolName, matcher, { dot: true, nocase: false })) return true
  } catch {
    // ignore
  }
  try {
    if (new RegExp(matcher).test(toolName)) return true
  } catch {
    // ignore
  }
  return false
}

export function loadPluginMatchers(
  _projectDir: string,
  event: HookEventName,
): HookMatcher[] {
  const plugins = getSessionPlugins()
  if (plugins.length === 0) return []

  const out: HookMatcher[] = []
  for (const plugin of plugins) {
    for (const hookPath of plugin.hooksFiles ?? []) {
      try {
        const stat = statSync(hookPath)
        const cached = pluginHooksCache.get(hookPath)
        if (cached && cached.mtimeMs === stat.mtimeMs) {
          out.push(
            ...(cached.byEvent[event] ?? []).map(m => ({
              matcher: m.matcher,
              hooks: m.hooks.map(h => ({ ...h, pluginRoot: plugin.rootDir })),
            })),
          )
          continue
        }

        const raw = readFileSync(hookPath, 'utf8')
        const parsed = JSON.parse(raw) as HookFileEnvelope
        const hookObj =
          parsed && typeof parsed === 'object' && parsed.hooks
            ? parsed.hooks
            : parsed
        const byEvent = parseHooksByEvent(hookObj)
        pluginHooksCache.set(hookPath, { mtimeMs: stat.mtimeMs, byEvent })
        out.push(
          ...(byEvent[event] ?? []).map(m => ({
            matcher: m.matcher,
            hooks: m.hooks.map(h => ({ ...h, pluginRoot: plugin.rootDir })),
          })),
        )
      } catch (err) {
        logError(err)
        continue
      }
    }

    const inlineByEvent = loadInlinePluginHooksByEvent(plugin)
    if (inlineByEvent?.[event]) {
      out.push(
        ...(inlineByEvent[event] ?? []).map(m => ({
          matcher: m.matcher,
          hooks: m.hooks.map(h => ({ ...h, pluginRoot: plugin.rootDir })),
        })),
      )
    }
  }
  return out
}

export function __resetHookRegistryCacheForTests(): void {
  settingsHooksCache.clear()
  pluginHooksCache.clear()
}
