import { existsSync } from 'fs'
import type { Dirent } from 'fs'
import { readdir, stat } from 'fs/promises'
import { dirname, join, resolve } from 'path'
import { homedir } from 'os'
import { resolveDataRoots } from '#config/dataRoots'
import { LEGACY_CONFIG_SUBDIRS } from '#core/compat/legacyPaths'

export function getLegacyPolicyBaseDir(): string {
  switch (process.platform) {
    case 'darwin':
      return '/Library/Application Support/ClaudeCode'
    case 'win32':
      return existsSync('C:\\Program Files\\ClaudeCode')
        ? 'C:\\Program Files\\ClaudeCode'
        : 'C:\\ProgramData\\ClaudeCode'
    default:
      return '/etc/claude-code'
  }
}

export function getSystemPolicyBaseDir(): string {
  switch (process.platform) {
    case 'darwin':
      return '/Library/Application Support/Kode'
    case 'win32':
      return existsSync('C:\\Program Files\\Kode')
        ? 'C:\\Program Files\\Kode'
        : 'C:\\ProgramData\\Kode'
    default:
      return '/etc/kode'
  }
}

function normalizeOverride(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? resolve(trimmed) : null
}

export function dedupeStrings(values: string[]): string[] {
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

export function getUserConfigRoots(): string[] {
  return resolveDataRoots().allRoots
}

export function getPolicyBaseDirs(): string[] {
  // Order matters: legacy is scanned first so Kode-first policy wins when both exist.
  return dedupeStrings([getLegacyPolicyBaseDir(), getSystemPolicyBaseDir()])
}

export function findProjectAgentDirs(cwd: string): string[] {
  const result: string[] = []
  const home = resolve(homedir())
  let current = resolve(cwd)

  const levels: Array<{ claudeDir: string; kodeDir: string }> = []

  while (current !== home) {
    levels.push({
      claudeDir: join(current, LEGACY_CONFIG_SUBDIRS.agents),
      kodeDir: join(current, '.kode', 'agents'),
    })

    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }

  // Apply deterministic precedence:
  // - ancestor directories are lower priority than descendants
  // - legacy dirs are lower priority than primary dirs at the same level
  for (const level of levels.reverse()) {
    if (existsSync(level.claudeDir)) result.push(level.claudeDir)
    if (existsSync(level.kodeDir)) result.push(level.kodeDir)
  }

  return result
}

export async function listMarkdownFilesRecursively(
  rootDir: string,
): Promise<string[]> {
  const files: string[] = []
  const visitedDirs = new Set<string>()
  const toVisit: string[] = [rootDir]

  if (!existsSync(rootDir)) return []

  while (toVisit.length > 0) {
    const dirPath = toVisit.pop()!
    let dirStat: Awaited<ReturnType<typeof stat>>
    try {
      dirStat = await stat(dirPath)
    } catch {
      continue
    }

    if (!dirStat.isDirectory()) continue

    const dirKey = `${dirStat.dev}:${dirStat.ino}`
    if (visitedDirs.has(dirKey)) continue
    visitedDirs.add(dirKey)

    let entries: Dirent[]
    try {
      entries = await readdir(dirPath, { withFileTypes: true })
    } catch {
      continue
    }

    entries.sort((a, b) => a.name.localeCompare(b.name))

    for (const entry of entries) {
      const name = String(entry.name ?? '')
      const fullPath = join(dirPath, name)

      if (entry.isDirectory()) {
        toVisit.push(fullPath)
        continue
      }

      if (entry.isFile()) {
        if (name.endsWith('.md')) files.push(fullPath)
        continue
      }

      if (entry.isSymbolicLink()) {
        try {
          const st = await stat(fullPath)
          if (st.isDirectory()) {
            toVisit.push(fullPath)
          } else if (st.isFile() && name.endsWith('.md')) {
            files.push(fullPath)
          }
        } catch {
          continue
        }
      }
    }
  }

  return files.sort()
}
