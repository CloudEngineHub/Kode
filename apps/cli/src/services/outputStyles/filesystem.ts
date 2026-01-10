import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import type { Dirent } from 'fs'
import { dirname, join, resolve } from 'path'
import { homedir } from 'os'
import matter from 'gray-matter'

export function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

export function getClaudePolicyBaseDir(): string {
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

export function getUserConfigBaseDirs(): { claude: string; kode: string }[] {
  const out: { claude: string; kode: string }[] = []

  const hasAnyOverride =
    typeof process.env.CLAUDE_CONFIG_DIR === 'string' ||
    typeof process.env.KODE_CONFIG_DIR === 'string'

  const claudeBase = normalizeString(process.env.CLAUDE_CONFIG_DIR)
  const kodeBase = normalizeString(process.env.KODE_CONFIG_DIR)

  if (claudeBase)
    out.push({ claude: resolve(claudeBase), kode: resolve(claudeBase) })
  if (kodeBase) out.push({ claude: resolve(kodeBase), kode: resolve(kodeBase) })

  if (hasAnyOverride) {
    // Respect test/host overrides: do not read from real home dirs when an override is set.
    return dedupeConfigBases(out)
  }

  return dedupeConfigBases([
    { claude: join(homedir(), '.claude'), kode: join(homedir(), '.claude') },
    { claude: join(homedir(), '.kode'), kode: join(homedir(), '.kode') },
  ])
}

function dedupeConfigBases(
  bases: Array<{ claude: string; kode: string }>,
): Array<{ claude: string; kode: string }> {
  const seen = new Set<string>()
  const out: Array<{ claude: string; kode: string }> = []
  for (const base of bases) {
    const key = `${base.claude}::${base.kode}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(base)
  }
  return out
}

export function findProjectSubdirs(subdir: string, cwd: string): string[] {
  const result: string[] = []
  const home = resolve(homedir())
  let current = resolve(cwd)

  while (current !== home) {
    const claudeDir = join(current, '.claude', subdir)
    if (existsSync(claudeDir)) result.push(claudeDir)

    const kodeDir = join(current, '.kode', subdir)
    if (existsSync(kodeDir)) result.push(kodeDir)

    const parent = dirname(current)
    if (parent === current) break
    current = parent
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
