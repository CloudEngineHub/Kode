import { existsSync, readdirSync, statSync } from 'node:fs'
import type { Dirent } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function getClaudePolicyBaseDir(): string {
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

function normalizeOverride(value: unknown): string | null {
  const normalized = normalizeString(value)
  return normalized ? resolve(normalized) : null
}

export function getUserConfigRoots(): string[] {
  const claudeOverride = normalizeOverride(process.env.CLAUDE_CONFIG_DIR)
  const kodeOverride = normalizeOverride(process.env.KODE_CONFIG_DIR)
  const overrides = [claudeOverride, kodeOverride].filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  )

  if (overrides.length > 0) {
    return Array.from(new Set(overrides))
  }

  return [join(homedir(), '.claude'), join(homedir(), '.kode')]
}

export function findProjectAgentDirs(cwd: string): string[] {
  const result: string[] = []
  const home = resolve(homedir())
  let current = resolve(cwd)

  while (current !== home) {
    const claudeDir = join(current, '.claude', 'agents')
    if (existsSync(claudeDir)) result.push(claudeDir)

    const kodeDir = join(current, '.kode', 'agents')
    if (existsSync(kodeDir)) result.push(kodeDir)

    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }

  return result
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
        if (name.toLowerCase().endsWith('.md')) files.push(fullPath)
        continue
      }

      if (entry.isSymbolicLink()) {
        try {
          const st = statSync(fullPath)
          if (st.isDirectory()) {
            walk(fullPath)
          } else if (st.isFile() && name.toLowerCase().endsWith('.md')) {
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

export function defaultValidationPaths(cwd: string): string[] {
  const out: string[] = []

  const policyDir = join(getClaudePolicyBaseDir(), '.claude', 'agents')
  if (existsSync(policyDir)) out.push(policyDir)

  for (const root of getUserConfigRoots()) {
    const dirPath = join(root, 'agents')
    if (existsSync(dirPath)) out.push(dirPath)
  }

  for (const dirPath of findProjectAgentDirs(cwd)) {
    if (existsSync(dirPath)) out.push(dirPath)
  }

  return out
}
