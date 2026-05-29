import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  getProjectInstructionFiles,
  readAndConcatProjectInstructionFiles,
} from '@utils/config/projectInstructions'

describe('projectInstructions path normalization', () => {
  let projectDir: string

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'kode-instructions-test-'))
    const { spawnSync } = require('child_process')
    spawnSync('git', ['init'], { cwd: projectDir, stdio: 'ignore' })
  })

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true })
  })

  test('root AGENTS.md path uses forward slashes in heading', () => {
    writeFileSync(join(projectDir, 'AGENTS.md'), 'root instructions\n', 'utf8')

    const files = getProjectInstructionFiles(projectDir)
    const { content } = readAndConcatProjectInstructionFiles(files, {
      includeHeadings: true,
      maxBytes: 10_000,
    })

    expect(content).toContain('# AGENTS.md')
    expect(content).toContain('_Path: AGENTS.md_')
    expect(content).toContain('root instructions')
  })

  test('nested AGENTS.md path uses forward slashes in heading', () => {
    const nestedDir = join(projectDir, 'a')
    mkdirSync(nestedDir, { recursive: true })
    writeFileSync(join(nestedDir, 'AGENTS.md'), 'nested instructions\n', 'utf8')

    const files = getProjectInstructionFiles(nestedDir)
    const { content } = readAndConcatProjectInstructionFiles(files, {
      includeHeadings: true,
      maxBytes: 10_000,
    })

    expect(content).toContain('# AGENTS.md')
    expect(content).toContain('nested instructions')
  })

  test('backslashes in paths are normalized to forward slashes in headings', () => {
    writeFileSync(join(projectDir, 'AGENTS.md'), 'test\n', 'utf8')

    const files = getProjectInstructionFiles(projectDir)
    const { content } = readAndConcatProjectInstructionFiles(files, {
      includeHeadings: true,
      maxBytes: 10_000,
    })

    const pathLine = content.split('\n').find(l => l.includes('_Path:'))
    if (pathLine) {
      expect(pathLine).not.toContain('\\')
    }
  })

  test('multiple AGENTS.md files in git tree are included', () => {
    writeFileSync(join(projectDir, 'AGENTS.md'), 'root instructions\n', 'utf8')

    const aDir = join(projectDir, 'a')
    mkdirSync(aDir, { recursive: true })
    writeFileSync(join(aDir, 'AGENTS.md'), 'a-instructions\n', 'utf8')

    const files = getProjectInstructionFiles(aDir)
    const { content, truncated } = readAndConcatProjectInstructionFiles(files, {
      includeHeadings: true,
      maxBytes: 10_000,
    })

    expect(truncated).toBe(false)
    expect(content).toContain('# AGENTS.md')
    expect(content).toContain('root instructions')
    expect(content).toContain('a-instructions')
  })

  test('includeHeadings=false omits path headings', () => {
    writeFileSync(join(projectDir, 'AGENTS.md'), 'test content\n', 'utf8')

    const files = getProjectInstructionFiles(projectDir)
    const { content } = readAndConcatProjectInstructionFiles(files, {
      includeHeadings: false,
      maxBytes: 10_000,
    })

    expect(content).not.toContain('# AGENTS.md')
    expect(content).not.toContain('_Path:')
    expect(content).toContain('test content')
  })

  test('empty AGENTS.md files are skipped', () => {
    writeFileSync(join(projectDir, 'AGENTS.md'), '', 'utf8')

    const files = getProjectInstructionFiles(projectDir)
    const { content } = readAndConcatProjectInstructionFiles(files, {
      includeHeadings: true,
      maxBytes: 10_000,
    })

    expect(content).toBe('')
  })

  test('path heading never contains backslash on any platform', () => {
    const nestedDir = join(projectDir, 'src', 'components')
    mkdirSync(nestedDir, { recursive: true })
    writeFileSync(
      join(nestedDir, 'AGENTS.md'),
      'component instructions\n',
      'utf8',
    )

    const files = getProjectInstructionFiles(nestedDir)
    const { content } = readAndConcatProjectInstructionFiles(files, {
      includeHeadings: true,
      maxBytes: 10_000,
    })

    const lines = content.split('\n')
    for (const line of lines) {
      if (line.includes('_Path:')) {
        expect(line).not.toMatch(/\\/)
      }
    }
  })
})
