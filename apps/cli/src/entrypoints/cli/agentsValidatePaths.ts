import { existsSync, readdirSync, statSync } from 'node:fs'
import type { Dirent } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { resolveDataRoots } from '#config/dataRoots'
import {
  LEGACY_CONFIG_DIRNAME,
  LEGACY_CONFIG_SUBDIRS,
} from '#core/compat/legacyPaths'

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function getLegacyPolicyBaseDir(): string {
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

function getSystemPolicyBaseDir(): string {
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

function getPolicyBaseDirs(): string[] {
  // Order matters: legacy is scanned first so Kode-first policy wins when both exist.
  return Array.from(
    new Set<string>([getLegacyPolicyBaseDir(), getSystemPolicyBaseDir()]),
  )
}

export function getUserConfigRoots(): string[] {
  return resolveDataRoots().allRoots
}

export function findProjectAgentDirs(cwd: string): string[] {
  const result: string[] = []
  const home = resolve(homedir())
  let current = resolve(cwd)

  while (current !== home) {
    const kodeDir = join(current, '.kode', 'agents')
    if (existsSync(kodeDir)) result.push(kodeDir)

    const claudeDir = join(current, LEGACY_CONFIG_DIRNAME, 'agents')
    if (existsSync(claudeDir)) result.push(claudeDir)

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

  for (const baseDir of getPolicyBaseDirs()) {
    for (const policyDir of [
      join(baseDir, LEGACY_CONFIG_SUBDIRS.agents),
      join(baseDir, '.kode', 'agents'),
    ]) {
      if (existsSync(policyDir)) out.push(policyDir)
    }
  }

  for (const root of getUserConfigRoots()) {
    const dirPath = join(root, 'agents')
    if (existsSync(dirPath)) out.push(dirPath)
  }

  for (const dirPath of findProjectAgentDirs(cwd)) {
    if (existsSync(dirPath)) out.push(dirPath)
  }

  return out
}
