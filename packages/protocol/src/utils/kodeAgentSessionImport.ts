import { copyFileSync, cpSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

import type { KodeAgentSessionListItem } from './kodeAgentSessionResume'
import { listKodeAgentSessions } from './kodeAgentSessionResume'
import {
  getSessionLogFilePath,
  getSessionStoreRoots,
  sanitizeProjectNameForSessionStore,
} from './kodeAgentSessionLog'

export type ImportableSession = KodeAgentSessionListItem & {
  sourcePath: string
  destinationPath: string
}

export type ImportLegacySessionResult =
  | {
      kind: 'imported'
      sessionId: string
      sourcePath: string
      destinationPath: string
    }
  | { kind: 'already_present'; sessionId: string; destinationPath: string }
  | { kind: 'not_found'; sessionId: string }
  | { kind: 'failed'; sessionId: string; message: string }

function resolveLegacySessionLogPath(args: {
  cwd: string
  sessionId: string
}): string | null {
  const projectName = sanitizeProjectNameForSessionStore(args.cwd)
  const roots = getSessionStoreRoots().slice(1)
  for (const root of roots) {
    const candidate = join(
      root,
      'projects',
      projectName,
      `${args.sessionId}.jsonl`,
    )
    if (existsSync(candidate)) return candidate
  }
  return null
}

function copyDirIfMissing(sourceDir: string, destinationDir: string): void {
  if (existsSync(destinationDir)) return
  cpSync(sourceDir, destinationDir, { recursive: true })
}

export function listImportableLegacySessions(args: {
  cwd: string
}): ImportableSession[] {
  const sessions = listKodeAgentSessions({ cwd: args.cwd })

  const importable: ImportableSession[] = []
  for (const session of sessions) {
    const destinationPath = getSessionLogFilePath({
      cwd: args.cwd,
      sessionId: session.sessionId,
    })
    if (existsSync(destinationPath)) continue

    const sourcePath = resolveLegacySessionLogPath({
      cwd: args.cwd,
      sessionId: session.sessionId,
    })
    if (!sourcePath) continue

    importable.push({ ...session, sourcePath, destinationPath })
  }

  return importable
}

export function importLegacySession(args: {
  cwd: string
  sessionId: string
}): ImportLegacySessionResult {
  const destinationPath = getSessionLogFilePath({
    cwd: args.cwd,
    sessionId: args.sessionId,
  })

  if (existsSync(destinationPath)) {
    return {
      kind: 'already_present',
      sessionId: args.sessionId,
      destinationPath,
    }
  }

  const sourcePath = resolveLegacySessionLogPath({
    cwd: args.cwd,
    sessionId: args.sessionId,
  })
  if (!sourcePath) return { kind: 'not_found', sessionId: args.sessionId }

  try {
    mkdirSync(dirname(destinationPath), { recursive: true })
    copyFileSync(sourcePath, destinationPath)

    const sourceSessionDir = join(dirname(sourcePath), args.sessionId)
    if (
      existsSync(sourceSessionDir) &&
      statSync(sourceSessionDir).isDirectory()
    ) {
      const destinationSessionDir = join(
        dirname(destinationPath),
        args.sessionId,
      )
      copyDirIfMissing(sourceSessionDir, destinationSessionDir)
    }

    return {
      kind: 'imported',
      sessionId: args.sessionId,
      sourcePath,
      destinationPath,
    }
  } catch (error) {
    return {
      kind: 'failed',
      sessionId: args.sessionId,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}
