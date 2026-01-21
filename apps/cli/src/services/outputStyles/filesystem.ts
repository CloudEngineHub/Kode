import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import type { Dirent } from 'fs'
import { dirname, join, resolve } from 'path'
import { homedir } from 'os'
import matter from 'gray-matter'
import { resolveDataRoots } from '#config/dataRoots'
import { LEGACY_CONFIG_DIRNAME } from '#core/compat/legacyPaths'

export function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

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

export function getUserConfigRoots(): string[] {
  const roots = resolveDataRoots()
  // Scan legacy roots first so Kode settings take precedence when names collide.
  return dedupeStrings([
    ...[...roots.claudeCompatRoots].reverse(),
    roots.kodeRoot,
  ])
}

function dedupeStrings(values: string[]): string[] {
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

export function getPolicyBaseDirs(): string[] {
  // Order matters: legacy is scanned first so Kode-first policy wins when both exist.
  return dedupeStrings([getLegacyPolicyBaseDir(), getSystemPolicyBaseDir()])
}

export function findProjectSubdirs(subdir: string, cwd: string): string[] {
  const result: string[] = []
  const home = resolve(homedir())
  let current = resolve(cwd)
  const chain: string[] = []

  while (current !== home) {
    chain.push(current)

    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }

  // Traverse from least-specific → most-specific so later entries override earlier ones.
  for (const dir of chain.reverse()) {
    const legacyDir = join(dir, LEGACY_CONFIG_DIRNAME, subdir)
    if (existsSync(legacyDir)) result.push(legacyDir)

    const kodeDir = join(dir, '.kode', subdir)
    if (existsSync(kodeDir)) result.push(kodeDir)
  }

  return result
}

export function markdownFirstLineOrHeading(
  content: string,
  fallback: string,
): string {
  const lines = content.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const heading = trimmed.match(/^#+\s+(.+)$/)?.[1] ?? trimmed
    return heading.length > 100 ? `${heading.substring(0, 97)}...` : heading
  }
  return fallback
}

export function listMarkdownFilesRecursively(rootDir: string): string[] {
  const files: string[] = []
  const visitedDirs = new Set<string>()

  const walk = (dirPath: string) => {
    let dirStat: ReturnType<typeof statSync>
    try {
      dirStat = statSync(dirPath)
    } catch {
      return
    }
    if (!dirStat.isDirectory()) return

    const dirKey = `${dirStat.dev}:${dirStat.ino}`
    if (visitedDirs.has(dirKey)) return
    visitedDirs.add(dirKey)

    let entries: Dirent[]
    try {
      entries = readdirSync(dirPath, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const name = String(entry.name ?? '')
      const fullPath = join(dirPath, name)

      if (entry.isDirectory()) {
        walk(fullPath)
        continue
      }

      if (entry.isFile()) {
        if (name.endsWith('.md')) files.push(fullPath)
        continue
      }

      if (entry.isSymbolicLink()) {
        try {
          const st = statSync(fullPath)
          if (st.isDirectory()) {
            walk(fullPath)
          } else if (st.isFile() && name.endsWith('.md')) {
            files.push(fullPath)
          }
        } catch {
          continue
        }
      }
    }
  }

  if (!existsSync(rootDir)) return []
  walk(rootDir)
  return files
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

export function readMarkdownFile(
  filePath: string,
): { frontmatter: Record<string, unknown>; content: string } | null {
  try {
    const raw = readFileSync(filePath, 'utf8')
    const parsed = matter(raw)
    return {
      frontmatter: asRecord(parsed.data),
      content: String(parsed.content ?? ''),
    }
  } catch {
    return null
  }
}

export function inodeKeyForPath(filePath: string): string | null {
  try {
    const st = statSync(filePath)
    return `${st.dev}:${st.ino}`
  } catch {
    return null
  }
}
