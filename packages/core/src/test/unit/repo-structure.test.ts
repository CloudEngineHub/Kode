import { describe, expect, it } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

function getRepoRootOrNull(): string | null {
  try {
    const out = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
    })
    const trimmed = out.trim()
    return trimmed ? trimmed : null
  } catch {
    return null
  }
}

function listTrackedFiles(repoRoot: string): string[] {
  try {
    const out = execFileSync('git', ['ls-files', '-z'], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
    return out.split('\0').filter(Boolean)
  } catch {
    return []
  }
}

function listDeletedTrackedFiles(repoRoot: string): string[] {
  try {
    const out = execFileSync('git', ['ls-files', '--deleted', '-z'], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
    return out.split('\0').filter(Boolean)
  } catch {
    return []
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

describe('repo structure contract', () => {
  it('keeps the expected top-level layout', () => {
    const repoRoot = getRepoRootOrNull() ?? process.cwd()

    for (const dir of [
      'apps',
      'packages',
      'ui',
      'scripts',
      'docs',
      'examples',
    ]) {
      expect(isDirectory(join(repoRoot, dir))).toBe(true)
    }
  })

  it('keeps apps/ as a single-app (kode) layout', () => {
    const repoRoot = getRepoRootOrNull() ?? process.cwd()
    const appsDir = join(repoRoot, 'apps')
    expect(isDirectory(appsDir)).toBe(true)

    const entries = readdirSync(appsDir, { withFileTypes: true })
    const unexpected = entries
      .filter(entry => !entry.name.startsWith('.'))
      .filter(entry => entry.name !== 'README.md' && entry.name !== 'kode')
      .map(entry => entry.name)
      .sort()

    expect(unexpected).toEqual([])
    expect(isDirectory(join(appsDir, 'kode'))).toBe(true)
  })

  it('does not track legacy/forbidden paths', () => {
    const repoRoot = getRepoRootOrNull()
    if (!repoRoot) {
      // In non-git environments (rare), skip the "tracked files" contract.
      return
    }

    const tracked = listTrackedFiles(repoRoot)
    const deleted = new Set(listDeletedTrackedFiles(repoRoot))
    const effectiveTracked = tracked.filter(file => !deleted.has(file))
    const forbiddenPrefixes = ['src/', 'vendor/', '.claude/', '.kode/']
    const forbiddenFiles = ['main.js']

    const offenders = effectiveTracked.filter(
      file =>
        forbiddenFiles.includes(file) ||
        forbiddenPrefixes.some(prefix => file.startsWith(prefix)),
    )

    expect(offenders).toEqual([])
  })

  it('gitignore covers local runtime folders', () => {
    const repoRoot = getRepoRootOrNull() ?? process.cwd()
    const gitignorePath = join(repoRoot, '.gitignore')
    expect(existsSync(gitignorePath)).toBe(true)

    const content = readFileSync(gitignorePath, 'utf8')
    expect(content).toContain('\n.claude/\n')
    expect(content).toContain('\n.kode/\n')
  })

  it('examples do not reference the removed root src/ layout', () => {
    const repoRoot = getRepoRootOrNull() ?? process.cwd()
    const examplesDir = join(repoRoot, 'examples')
    expect(isDirectory(examplesDir)).toBe(true)

    const offenders: string[] = []

    const walk = (dir: string, relativeDir: string) => {
      const entries = readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const abs = join(dir, entry.name)
        const rel = relativeDir ? `${relativeDir}/${entry.name}` : entry.name
        if (entry.isDirectory()) {
          walk(abs, rel)
          continue
        }
        const text = readFileSync(abs, 'utf8')
        if (text.includes('../src/') || text.includes('..\\\\src\\\\')) {
          offenders.push(rel)
        }
      }
    }

    walk(examplesDir, '')
    expect(offenders).toEqual([])
  })
})
