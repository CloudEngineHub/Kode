import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  findGitRoot,
  getProjectInstructionFiles,
  readAndConcatProjectInstructionFiles,
} from '#core/utils/projectInstructions'
import { getProjectDocsForCwd } from '#core/context'

function normalizePath(p: string): string {
  return p.replaceAll('\\', '/')
}

describe('projectInstructions (AGENTS.md discovery)', () => {
  test('findGitRoot returns null when no .git is found', () => {
    const root = mkdtempSync(join(tmpdir(), 'kode-agents-test-'))
    const nested = join(root, 'a', 'b')
    mkdirSync(nested, { recursive: true })
    expect(findGitRoot(nested)).toBe(null)
  })

  test('findGitRoot returns the nearest parent containing .git', () => {
    const root = mkdtempSync(join(tmpdir(), 'kode-agents-test-'))
    mkdirSync(join(root, '.git'), { recursive: true })
    const nested = join(root, 'a', 'b')
    mkdirSync(nested, { recursive: true })
    expect(normalizePath(findGitRoot(nested) ?? '')).toBe(normalizePath(root))
  })

  test('getProjectInstructionFiles stacks from git root → cwd', () => {
    const root = mkdtempSync(join(tmpdir(), 'kode-agents-test-'))
    mkdirSync(join(root, '.git'), { recursive: true })
    writeFileSync(join(root, 'AGENTS.md'), 'root-instructions\n', 'utf8')

    const aDir = join(root, 'a')
    mkdirSync(aDir, { recursive: true })
    writeFileSync(join(aDir, 'AGENTS.md'), 'a-instructions\n', 'utf8')

    const bDir = join(aDir, 'b')
    mkdirSync(bDir, { recursive: true })

    const files = getProjectInstructionFiles(bDir)
    expect(files.map(f => normalizePath(f.relativePathFromGitRoot))).toEqual([
      'AGENTS.md',
      'a/AGENTS.md',
    ])
  })

  test('AGENTS.override.md is preferred over AGENTS.md within a directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'kode-agents-test-'))
    mkdirSync(join(root, '.git'), { recursive: true })
    writeFileSync(join(root, 'AGENTS.md'), 'default\n', 'utf8')
    writeFileSync(join(root, 'AGENTS.override.md'), 'override\n', 'utf8')

    const files = getProjectInstructionFiles(root)
    expect(files.map(f => f.filename)).toEqual(['AGENTS.override.md'])

    const { content } = readAndConcatProjectInstructionFiles(files, {
      includeHeadings: false,
      maxBytes: 10_000,
    })
    expect(content).toContain('override')
    expect(content).not.toContain('default')
  })

  test('readAndConcatProjectInstructionFiles truncates to a max byte budget', () => {
    const root = mkdtempSync(join(tmpdir(), 'kode-agents-test-'))
    mkdirSync(join(root, '.git'), { recursive: true })
    const p = join(root, 'AGENTS.md')

    writeFileSync(p, 'x'.repeat(10_000), 'utf8')

    const files = getProjectInstructionFiles(root)
    const maxBytes = 128
    const { content, truncated } = readAndConcatProjectInstructionFiles(files, {
      includeHeadings: false,
      maxBytes,
    })

    expect(truncated).toBe(true)
    expect(Buffer.byteLength(content, 'utf8')).toBeLessThanOrEqual(maxBytes)
  })
})

describe('projectDocs (legacy CLAUDE.md fallback)', () => {
  test('getProjectDocs includes legacy CLAUDE.md when present', async () => {
    const root = mkdtempSync(join(tmpdir(), 'kode-claude-legacy-test-'))
    writeFileSync(join(root, 'AGENTS.md'), 'agents\n', 'utf8')
    writeFileSync(join(root, 'CLAUDE.md'), 'legacy\n', 'utf8')

    const docs = await getProjectDocsForCwd(root)
    expect(docs).not.toBeNull()
    expect(docs ?? '').toContain('agents')
    expect(docs ?? '').toContain('Legacy instructions (CLAUDE.md')
    expect(docs ?? '').toContain('legacy')
  })
})
