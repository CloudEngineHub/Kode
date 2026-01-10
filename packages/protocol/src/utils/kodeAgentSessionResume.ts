import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'

import {
  getSessionProjectDir,
  getSessionProjectsDir,
} from './kodeAgentSessionLog'

export type KodeAgentSessionListItem = {
  sessionId: string
  slug: string | null
  customTitle: string | null
  tag: string | null
  summary: string | null
  cwd: string | null
  createdAt: Date | null
  modifiedAt: Date | null
}

export type ResumeResolveResult =
  | { kind: 'ok'; sessionId: string }
  | { kind: 'ambiguous'; identifier: string; matchingSessionIds: string[] }
  | { kind: 'different_directory'; sessionId: string; otherCwd: string | null }
  | { kind: 'not_found'; identifier: string }

function safeParseJson(line: string): unknown | null {
  try {
    return JSON.parse(line)
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function safeParseDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  )
}

function readSessionListItemBestEffort(args: {
  filePath: string
  sessionId: string
}): Omit<KodeAgentSessionListItem, 'sessionId'> {
  const { filePath, sessionId } = args

  let slug: string | null = null
  let cwd: string | null = null
  let createdAt: Date | null = null
  let modifiedAt: Date | null = null
  let customTitle: string | null = null
  let tag: string | null = null
  let lastAssistantUuid: string | null = null
  const summariesByLeaf = new Map<string, string>()
  let lastSummary: string | null = null

  try {
    modifiedAt = new Date(statSync(filePath).mtimeMs)
  } catch {
    modifiedAt = null
  }

  let content: string
  try {
    content = readFileSync(filePath, 'utf8')
  } catch {
    return {
      slug,
      customTitle,
      tag,
      summary: null,
      cwd,
      createdAt,
      modifiedAt,
    }
  }

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    const parsed = safeParseJson(line)
    const entry = isRecord(parsed) ? parsed : null
    if (!entry) continue

    if (!slug && typeof entry.slug === 'string' && entry.slug.trim()) {
      slug = entry.slug.trim()
    }
    if (!cwd && typeof entry.cwd === 'string' && entry.cwd.trim()) {
      cwd = entry.cwd.trim()
    }
    if (!createdAt) {
      const ts = safeParseDate(entry.timestamp)
      if (ts) createdAt = ts
    }

    const type = typeof entry.type === 'string' ? entry.type : ''
    if (!type) continue

    if (type === 'assistant') {
      if (typeof entry.uuid === 'string' && entry.uuid)
        lastAssistantUuid = entry.uuid
      continue
    }

    if (type === 'summary') {
      const leafUuid = typeof entry.leafUuid === 'string' ? entry.leafUuid : ''
      const summary = typeof entry.summary === 'string' ? entry.summary : ''
      if (leafUuid && summary) {
        summariesByLeaf.set(leafUuid, summary)
        lastSummary = summary
      }
      continue
    }

    if (type === 'custom-title') {
      const id = typeof entry.sessionId === 'string' ? entry.sessionId : ''
      const title =
        typeof entry.customTitle === 'string' ? entry.customTitle : ''
      if (id === sessionId && title) customTitle = title
      continue
    }

    if (type === 'tag') {
      const id = typeof entry.sessionId === 'string' ? entry.sessionId : ''
      const t = typeof entry.tag === 'string' ? entry.tag : ''
      if (id === sessionId && t) tag = t
      continue
    }
  }

  const summary =
    (lastAssistantUuid
      ? (summariesByLeaf.get(lastAssistantUuid) ?? null)
      : null) ??
    lastSummary ??
    null

  return {
    slug,
    customTitle,
    tag,
    summary,
    cwd,
    createdAt,
    modifiedAt,
  }
}

export function listKodeAgentSessions(args: {
  cwd: string
}): KodeAgentSessionListItem[] {
  const { cwd } = args
  const projectDir = getSessionProjectDir(cwd)
  if (!existsSync(projectDir)) return []

  const candidates = readdirSync(projectDir)
    .filter(name => name.endsWith('.jsonl'))
    .filter(name => !name.startsWith('agent-'))
    .map(name => ({
      sessionId: basename(name, '.jsonl'),
      filePath: join(projectDir, name),
    }))
    .filter(c => isUuid(c.sessionId))

  const items = candidates.map(({ sessionId, filePath }) => ({
    sessionId,
    ...readSessionListItemBestEffort({ filePath, sessionId }),
  }))

  items.sort((a, b) => {
    const am = a.modifiedAt?.getTime() ?? 0
    const bm = b.modifiedAt?.getTime() ?? 0
    return bm - am
  })

  return items
}

function findSessionFileAcrossProjects(args: {
  sessionId: string
}): { filePath: string } | null {
  const { sessionId } = args
  const projectsDir = getSessionProjectsDir()
  if (!existsSync(projectsDir)) return null

  let projectNames: string[]
  try {
    projectNames = readdirSync(projectsDir)
  } catch {
    return null
  }

  for (const projectName of projectNames) {
    const candidate = join(projectsDir, projectName, `${sessionId}.jsonl`)
    if (existsSync(candidate)) return { filePath: candidate }
  }

  return null
}

function readSessionCwdBestEffort(filePath: string): string | null {
  try {
    const content = readFileSync(filePath, 'utf8')
    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim()
      if (!line) continue
      const parsed = safeParseJson(line)
      const record = isRecord(parsed) ? parsed : null
      if (!record) continue
      const cwd = record.cwd
      if (typeof cwd === 'string' && cwd.trim()) return cwd.trim()
    }
  } catch {
    // ignore
  }
  return null
}

function sessionExistsInProject(cwd: string, sessionId: string): boolean {
  try {
    return existsSync(join(getSessionProjectDir(cwd), `${sessionId}.jsonl`))
  } catch {
    return false
  }
}

export function resolveResumeSessionIdentifier(args: {
  cwd: string
  identifier: string
}): ResumeResolveResult {
  const { cwd, identifier } = args
  const id = identifier.trim()
  if (!id) return { kind: 'not_found', identifier }

  if (isUuid(id)) {
    if (sessionExistsInProject(cwd, id)) return { kind: 'ok', sessionId: id }

    const elsewhere = findSessionFileAcrossProjects({ sessionId: id })
    if (elsewhere) {
      return {
        kind: 'different_directory',
        sessionId: id,
        otherCwd: readSessionCwdBestEffort(elsewhere.filePath),
      }
    }

    return { kind: 'not_found', identifier: id }
  }

  const sessions = listKodeAgentSessions({ cwd })
  const matches = sessions
    .filter(s => s.slug === id || s.customTitle === id)
    .map(s => s.sessionId)

  if (matches.length === 1) return { kind: 'ok', sessionId: matches[0]! }
  if (matches.length > 1)
    return { kind: 'ambiguous', identifier: id, matchingSessionIds: matches }
  return { kind: 'not_found', identifier: id }
}
