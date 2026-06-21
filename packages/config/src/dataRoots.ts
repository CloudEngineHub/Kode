import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { LEGACY_ENV } from './compat/legacyEnv'
import { LEGACY_CONFIG_DIRNAME } from './compat/legacyPaths'

export type DataRoots = {
  kodeRoot: string
  claudeCompatRoots: string[]
  allRoots: string[]
}

type ResolveDataRootsOptions = {
  homeDir?: string
  respectEnvOverride?: boolean
}

function getDefaultHomeDir(): string {
  const envHome =
    typeof process.env.HOME === 'string'
      ? process.env.HOME
      : typeof process.env.USERPROFILE === 'string'
        ? process.env.USERPROFILE
        : ''
  const trimmed = envHome.trim()
  if (trimmed) return trimmed
  return homedir()
}

function expandTilde(value: string, homeDir: string): string {
  if (value === '~') return homeDir
  if (!value.startsWith('~/')) return value
  return join(homeDir, value.slice(2))
}

function normalizeOverride(value: unknown, homeDir: string): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return resolve(expandTilde(trimmed, homeDir))
}

function dedupeStrings(values: Array<string | null>): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    if (!value) continue
    if (seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}

function getKodeOverride(homeDir: string): string | null {
  return normalizeOverride(
    process.env.KODE_CONFIG_DIR ?? process.env.ANYKODE_CONFIG_DIR,
    homeDir,
  )
}

function getClaudeOverride(homeDir: string): string | null {
  return normalizeOverride(process.env[LEGACY_ENV.configDir], homeDir)
}

export function resolveDataRoots(options?: ResolveDataRootsOptions): DataRoots {
  const homeDir = options?.homeDir ?? getDefaultHomeDir()
  const respectEnvOverride =
    options?.respectEnvOverride ?? options?.homeDir === undefined

  const kodeRoot = respectEnvOverride
    ? (getKodeOverride(homeDir) ?? join(homeDir, '.kode'))
    : join(homeDir, '.kode')

  const claudeCompatRoots = respectEnvOverride
    ? dedupeStrings([
        getClaudeOverride(homeDir),
        join(homeDir, LEGACY_CONFIG_DIRNAME),
      ])
    : [join(homeDir, LEGACY_CONFIG_DIRNAME)]

  const allRoots = dedupeStrings([kodeRoot, ...claudeCompatRoots])

  return { kodeRoot, claudeCompatRoots, allRoots }
}

export function getKodeRoot(options?: ResolveDataRootsOptions): string {
  return resolveDataRoots(options).kodeRoot
}

export function getClaudeCompatRoots(
  options?: ResolveDataRootsOptions,
): string[] {
  return resolveDataRoots(options).claudeCompatRoots
}
