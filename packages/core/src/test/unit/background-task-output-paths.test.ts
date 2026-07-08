import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { setCwd, setOriginalCwd } from '#core/utils/state'
import { extractBackgroundTaskOutputIdFromPath } from '#core/tasks/outputPaths'

function sanitizeProjectKey(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-')
}

describe('background task output paths', () => {
  const runnerCwd = process.cwd()

  let configDir: string
  let projectDir: string
  let tmpClaude: string
  let previousKodeConfigDir: string | undefined
  let previousKodeProjectDir: string | undefined
  let previousClaudeTmpDir: string | undefined
  let previousClaudeTmp: string | undefined

  beforeEach(async () => {
    previousKodeConfigDir = process.env.KODE_CONFIG_DIR
    previousKodeProjectDir = process.env.KODE_PROJECT_DIR
    previousClaudeTmpDir = process.env.CLAUDE_TMPDIR
    previousClaudeTmp = process.env.CLAUDE_CODE_TMPDIR

    configDir = mkdtempSync(join(tmpdir(), 'kode-task-output-config-'))
    projectDir = mkdtempSync(join(tmpdir(), 'kode-task-output-proj-'))
    tmpClaude = mkdtempSync(join(tmpdir(), 'kode-task-output-tmp-'))

    process.env.KODE_CONFIG_DIR = configDir
    delete process.env.KODE_PROJECT_DIR
    delete process.env.CLAUDE_TMPDIR
    process.env.CLAUDE_CODE_TMPDIR = tmpClaude
    setOriginalCwd(projectDir)
    await setCwd(projectDir)
  })

  afterEach(async () => {
    await setCwd(runnerCwd)
    setOriginalCwd(runnerCwd)
    if (previousKodeConfigDir === undefined) {
      delete process.env.KODE_CONFIG_DIR
    } else {
      process.env.KODE_CONFIG_DIR = previousKodeConfigDir
    }
    if (previousKodeProjectDir === undefined) {
      delete process.env.KODE_PROJECT_DIR
    } else {
      process.env.KODE_PROJECT_DIR = previousKodeProjectDir
    }
    if (previousClaudeTmpDir === undefined) {
      delete process.env.CLAUDE_TMPDIR
    } else {
      process.env.CLAUDE_TMPDIR = previousClaudeTmpDir
    }
    if (previousClaudeTmp === undefined) {
      delete process.env.CLAUDE_CODE_TMPDIR
    } else {
      process.env.CLAUDE_CODE_TMPDIR = previousClaudeTmp
    }
    rmSync(configDir, { recursive: true, force: true })
    rmSync(projectDir, { recursive: true, force: true })
    rmSync(tmpClaude, { recursive: true, force: true })
  })

  test('extracts task output ids from Kode project task output paths', () => {
    const projectKey = sanitizeProjectKey(projectDir)
    const outputPath = join(configDir, projectKey, 'tasks', 'task_1.output')

    expect(extractBackgroundTaskOutputIdFromPath(outputPath)).toBe('task_1')
  })

  test('extracts task output ids from legacy Claude tmpdir task paths', () => {
    const projectKey = sanitizeProjectKey(projectDir)
    const outputPath = join(
      tmpClaude,
      'claude',
      projectKey,
      'tasks',
      'task_2.output',
    )

    expect(extractBackgroundTaskOutputIdFromPath(outputPath)).toBe('task_2')
  })

  test('rejects nested or invalid task output ids', () => {
    const projectKey = sanitizeProjectKey(projectDir)
    const nestedPath = join(
      configDir,
      projectKey,
      'tasks',
      'nested',
      'task_3.output',
    )
    const longIdPath = join(
      configDir,
      projectKey,
      'tasks',
      'task-id-that-is-too-long.output',
    )

    expect(extractBackgroundTaskOutputIdFromPath(nestedPath)).toBeNull()
    expect(extractBackgroundTaskOutputIdFromPath(longIdPath)).toBeNull()
  })
})
