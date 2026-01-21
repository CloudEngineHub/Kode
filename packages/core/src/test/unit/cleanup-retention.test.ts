import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { cleanupOldMessageFiles } from '#core/utils/cleanup'
import { setCwd } from '#core/utils/state'

function setMtimeDaysAgo(filePath: string, daysAgo: number): void {
  const now = Date.now()
  const ms = now - daysAgo * 24 * 60 * 60 * 1000
  const date = new Date(ms)
  utimesSync(filePath, date, date)
}

describe('cleanup retention (cleanupPeriodDays)', () => {
  const runnerCwd = process.cwd()
  const previousConfigDir = process.env.KODE_CONFIG_DIR

  let configDir: string
  let projectDir: string

  beforeEach(async () => {
    configDir = mkdtempSync(join(tmpdir(), 'kode-cleanup-config-'))
    projectDir = mkdtempSync(join(tmpdir(), 'kode-cleanup-proj-'))
    process.env.KODE_CONFIG_DIR = configDir
    await setCwd(projectDir)
  })

  afterEach(async () => {
    await setCwd(runnerCwd)
    if (previousConfigDir === undefined) {
      delete process.env.KODE_CONFIG_DIR
    } else {
      process.env.KODE_CONFIG_DIR = previousConfigDir
    }
    rmSync(configDir, { recursive: true, force: true })
    rmSync(projectDir, { recursive: true, force: true })
  })

  test('cleanupPeriodDays=0 disables cleanup', async () => {
    writeFileSync(
      join(configDir, 'settings.json'),
      JSON.stringify({ cleanupPeriodDays: 0 }, null, 2),
      'utf8',
    )

    const planDir = join(configDir, 'plans')
    mkdirSync(planDir, { recursive: true })
    const oldPlan = join(planDir, 'old.md')
    writeFileSync(oldPlan, 'x', 'utf8')
    setMtimeDaysAgo(oldPlan, 60)

    await cleanupOldMessageFiles()
    expect(existsSync(oldPlan)).toBe(true)
  })

  test('deletes old plan files when cleanupPeriodDays is set', async () => {
    writeFileSync(
      join(configDir, 'settings.json'),
      JSON.stringify({ cleanupPeriodDays: 1 }, null, 2),
      'utf8',
    )

    const planDir = join(configDir, 'plans')
    mkdirSync(planDir, { recursive: true })
    const oldPlan = join(planDir, 'old.md')
    const newPlan = join(planDir, 'new.md')
    writeFileSync(oldPlan, 'old', 'utf8')
    writeFileSync(newPlan, 'new', 'utf8')
    setMtimeDaysAgo(oldPlan, 3)

    await cleanupOldMessageFiles()
    expect(existsSync(oldPlan)).toBe(false)
    expect(existsSync(newPlan)).toBe(true)
  })

  test('cleans forked message filenames using mtime (no timestamp parsing)', async () => {
    writeFileSync(
      join(configDir, 'settings.json'),
      JSON.stringify({ cleanupPeriodDays: 1 }, null, 2),
      'utf8',
    )

    const projectKey = process.cwd().replace(/[^a-zA-Z0-9]/g, '-')
    const messagesDir = join(configDir, projectKey, 'messages')
    mkdirSync(messagesDir, { recursive: true })
    const forked = join(messagesDir, '2025-01-27T01-31-35-104Z-1.json')
    writeFileSync(forked, '[]', 'utf8')
    setMtimeDaysAgo(forked, 3)

    await cleanupOldMessageFiles()
    expect(existsSync(forked)).toBe(false)
  })

  test('cleans projects/*.jsonl and nested session dirs', async () => {
    writeFileSync(
      join(configDir, 'settings.json'),
      JSON.stringify({ cleanupPeriodDays: 1 }, null, 2),
      'utf8',
    )

    const projectsDir = join(configDir, 'projects')
    const projectKey = process.cwd().replace(/[^a-zA-Z0-9]/g, '-')
    const projectRoot = join(projectsDir, projectKey)
    mkdirSync(projectRoot, { recursive: true })

    const sessionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const oldSessionLog = join(projectRoot, `${sessionId}.jsonl`)
    writeFileSync(oldSessionLog, '{"type":"user"}\n', 'utf8')
    setMtimeDaysAgo(oldSessionLog, 3)

    const toolResultsDir = join(projectRoot, sessionId, 'tool-results')
    mkdirSync(toolResultsDir, { recursive: true })
    const oldToolResult = join(toolResultsDir, 'toolu_1.txt')
    writeFileSync(oldToolResult, 'result', 'utf8')
    setMtimeDaysAgo(oldToolResult, 3)

    await cleanupOldMessageFiles()
    expect(existsSync(oldSessionLog)).toBe(false)
    expect(existsSync(oldToolResult)).toBe(false)
  })
})
