import { promises as fs, type Dirent } from 'node:fs'
import { dirname, join } from 'node:path'

import { loadSettingsWithLegacyFallback } from '#config'
import { getKodeBaseDir } from '#core/utils/env'
import { getOriginalCwd } from '#core/utils/state'

import { logError } from './log'
import { CACHE_PATHS, LEGACY_CACHE_PATHS } from './log'

const DEFAULT_CLEANUP_PERIOD_DAYS = 30
const ONE_DAY_MS = 24 * 60 * 60 * 1000

export type CleanupResult = {
  messages: number
  errors: number
}

function toFiniteNonNegativeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const parsed = Number(trimmed)
    if (Number.isFinite(parsed) && parsed >= 0) return parsed
  }
  return null
}

function readCleanupPeriodDays(): number {
  const settings =
    loadSettingsWithLegacyFallback({
      destination: 'userSettings',
      migrateToPrimary: false,
    }).settings ?? {}

  const raw = (settings as Record<string, unknown>)['cleanupPeriodDays']
  const parsed = toFiniteNonNegativeNumber(raw)
  return parsed ?? DEFAULT_CLEANUP_PERIOD_DAYS
}

function computeCutoffDate(days: number): Date | null {
  if (days === 0) return null
  return new Date(Date.now() - days * ONE_DAY_MS)
}

function addCounts(target: CleanupResult, delta: CleanupResult): void {
  target.messages += delta.messages
  target.errors += delta.errors
}

async function safeReadDirEntries(dirPath: string): Promise<Dirent[] | null> {
  try {
    return await fs.readdir(dirPath, { withFileTypes: true })
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return null
    }
    logError(
      `Failed to read directory ${dirPath}: ${error instanceof Error ? error.message : String(error)}`,
    )
    return null
  }
}

async function safeUnlink(path: string): Promise<boolean> {
  try {
    await fs.unlink(path)
    return true
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return false
    }
    logError(
      `Failed to delete file ${path}: ${error instanceof Error ? error.message : String(error)}`,
    )
    return false
  }
}

async function safeRmDirIfEmpty(path: string): Promise<void> {
  try {
    const entries = await fs.readdir(path)
    if (entries.length > 0) return
    await fs.rmdir(path)
  } catch {
    // best-effort only
  }
}

async function cleanupFilesInDir(args: {
  dirPath: string
  cutoff: Date
  suffix: string | null
  countKind: keyof CleanupResult
}): Promise<CleanupResult> {
  const out: CleanupResult = { messages: 0, errors: 0 }

  const entries = await safeReadDirEntries(args.dirPath)
  if (!entries) return out

  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (args.suffix !== null && !entry.name.endsWith(args.suffix)) continue

    const filePath = join(args.dirPath, entry.name)
    try {
      const st = await fs.stat(filePath)
      if (st.mtime >= args.cutoff) continue

      const deleted = await safeUnlink(filePath)
      if (deleted) out[args.countKind] += 1
    } catch {
      out.errors += 1
    }
  }

  await safeRmDirIfEmpty(args.dirPath)
  return out
}

async function cleanupDirectoryTreeIfEmpty(args: {
  dirPath: string
  cutoff: Date
  suffix: string | null
  countKind: keyof CleanupResult
}): Promise<CleanupResult> {
  return cleanupFilesInDir(args)
}

async function cleanupMcpLogs(cutoff: Date): Promise<CleanupResult> {
  const out: CleanupResult = { messages: 0, errors: 0 }

  const baseLogsDir = dirname(LEGACY_CACHE_PATHS.errors())
  const entries = await safeReadDirEntries(baseLogsDir)
  if (!entries) return out

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (!entry.name.startsWith('mcp-logs-')) continue

    const dirPath = join(baseLogsDir, entry.name)
    addCounts(
      out,
      await cleanupDirectoryTreeIfEmpty({
        dirPath,
        cutoff,
        suffix: null,
        countKind: 'errors',
      }),
    )
    await safeRmDirIfEmpty(dirPath)
  }

  return out
}

async function cleanupPlans(cutoff: Date): Promise<CleanupResult> {
  return cleanupFilesInDir({
    dirPath: join(getKodeBaseDir(), 'plans'),
    cutoff,
    suffix: '.md',
    countKind: 'messages',
  })
}

async function cleanupPasteCache(cutoff: Date): Promise<CleanupResult> {
  return cleanupFilesInDir({
    dirPath: join(getKodeBaseDir(), 'paste-cache'),
    cutoff,
    suffix: '.txt',
    countKind: 'messages',
  })
}

async function cleanupSessionSubdirs(args: {
  sessionDir: string
  cutoff: Date
}): Promise<CleanupResult> {
  const out: CleanupResult = { messages: 0, errors: 0 }

  addCounts(
    out,
    await cleanupFilesInDir({
      dirPath: join(args.sessionDir, 'tool-results'),
      cutoff: args.cutoff,
      suffix: null,
      countKind: 'messages',
    }),
  )

  addCounts(
    out,
    await cleanupFilesInDir({
      dirPath: join(args.sessionDir, 'subagents'),
      cutoff: args.cutoff,
      suffix: '.jsonl',
      countKind: 'messages',
    }),
  )

  addCounts(
    out,
    await cleanupFilesInDir({
      dirPath: join(args.sessionDir, 'session-memory'),
      cutoff: args.cutoff,
      suffix: null,
      countKind: 'messages',
    }),
  )

  await safeRmDirIfEmpty(args.sessionDir)
  return out
}

async function cleanupProjects(cutoff: Date): Promise<CleanupResult> {
  const out: CleanupResult = { messages: 0, errors: 0 }

  const projectsRoot = join(getKodeBaseDir(), 'projects')
  const projectDirs = await safeReadDirEntries(projectsRoot)
  if (!projectDirs) return out

  for (const projectEntry of projectDirs) {
    if (!projectEntry.isDirectory()) continue
    const projectDir = join(projectsRoot, projectEntry.name)

    addCounts(
      out,
      await cleanupFilesInDir({
        dirPath: projectDir,
        cutoff,
        suffix: '.jsonl',
        countKind: 'messages',
      }),
    )

    const sessionEntries = await safeReadDirEntries(projectDir)
    if (!sessionEntries) continue

    for (const sessionEntry of sessionEntries) {
      if (!sessionEntry.isDirectory()) continue
      const sessionDir = join(projectDir, sessionEntry.name)
      addCounts(out, await cleanupSessionSubdirs({ sessionDir, cutoff }))
    }

    await safeRmDirIfEmpty(projectDir)
  }

  await safeRmDirIfEmpty(projectsRoot)
  return out
}

async function cleanupConversationScopedDirs(
  cutoff: Date,
): Promise<CleanupResult> {
  const out: CleanupResult = { messages: 0, errors: 0 }

  const baseDir = getKodeBaseDir()
  for (const rootName of ['tool-results', 'bash-outputs']) {
    const rootPath = join(baseDir, rootName)
    const entries = await safeReadDirEntries(rootPath)
    if (!entries) continue

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const dirPath = join(rootPath, entry.name)
      addCounts(
        out,
        await cleanupFilesInDir({
          dirPath,
          cutoff,
          suffix: null,
          countKind: 'messages',
        }),
      )
      await safeRmDirIfEmpty(dirPath)
    }

    await safeRmDirIfEmpty(rootPath)
  }

  // Current-project background task outputs (Kode-specific layout).
  const projectKey = getOriginalCwd().replace(/[^a-zA-Z0-9]/g, '-')
  addCounts(
    out,
    await cleanupFilesInDir({
      dirPath: join(baseDir, projectKey, 'tasks'),
      cutoff,
      suffix: '.output',
      countKind: 'messages',
    }),
  )

  return out
}

export async function cleanupOldMessageFiles(): Promise<CleanupResult> {
  const days = readCleanupPeriodDays()
  const cutoff = computeCutoffDate(days)
  const deletedCounts: CleanupResult = { messages: 0, errors: 0 }

  if (!cutoff) {
    return deletedCounts
  }

  const targets: Array<{ dirPath: string; countKind: keyof CleanupResult }> = [
    { dirPath: CACHE_PATHS.messages(), countKind: 'messages' },
    { dirPath: CACHE_PATHS.errors(), countKind: 'errors' },
    { dirPath: LEGACY_CACHE_PATHS.messages(), countKind: 'messages' },
    { dirPath: LEGACY_CACHE_PATHS.errors(), countKind: 'errors' },
  ]

  for (const target of targets) {
    addCounts(
      deletedCounts,
      await cleanupFilesInDir({
        dirPath: target.dirPath,
        cutoff,
        suffix: null,
        countKind: target.countKind,
      }),
    )
  }

  addCounts(deletedCounts, await cleanupMcpLogs(cutoff))
  addCounts(deletedCounts, await cleanupPlans(cutoff))
  addCounts(deletedCounts, await cleanupPasteCache(cutoff))
  addCounts(deletedCounts, await cleanupProjects(cutoff))
  addCounts(deletedCounts, await cleanupConversationScopedDirs(cutoff))

  return deletedCounts
}

export function cleanupOldMessageFilesInBackground(): void {
  const immediate = setImmediate(cleanupOldMessageFiles)

  // Prevent the setImmediate from keeping the process alive
  immediate.unref()
}
