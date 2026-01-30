import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

import { safeParseJSON } from '../json'
import { resolveDataRoots } from '../dataRoots'

export type LegacyClaudeJsonConfig = Record<string, unknown>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function dedupeStrings(values: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const trimmed = value.trim()
    if (!trimmed) continue
    if (seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
  }
  return out
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

export function getLegacyClaudeJsonConfigCandidates(options?: {
  homeDir?: string
}): string[] {
  const homeDir = resolve(options?.homeDir ?? getDefaultHomeDir())
  const roots = resolveDataRoots({ homeDir })

  const suffixes = ['', '-staging-oauth', '-local-oauth']
  const candidates: string[] = []

  for (const root of roots.claudeCompatRoots) {
    candidates.push(join(root, '.config.json'))
  }

  for (const suffix of suffixes) {
    candidates.push(join(homeDir, `.claude${suffix}.json`))
  }

  for (const root of roots.claudeCompatRoots) {
    for (const suffix of suffixes) {
      candidates.push(join(root, `.claude${suffix}.json`))
    }
  }

  return dedupeStrings(candidates)
}

export function loadLegacyClaudeJsonConfig(options?: { homeDir?: string }): {
  config: LegacyClaudeJsonConfig | null
  usedPath: string | null
} {
  const candidates = getLegacyClaudeJsonConfigCandidates(options)
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue
    try {
      const parsed = safeParseJSON(readFileSync(candidate, 'utf8'))
      if (!isRecord(parsed)) continue
      return { config: parsed, usedPath: candidate }
    } catch {
      continue
    }
  }
  return { config: null, usedPath: null }
}
