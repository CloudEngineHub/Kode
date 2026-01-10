import { isAbsolute, relative } from 'path'

import { getCwd } from '#core/utils/state'

export const MAX_RESULT_CHARS = 20_000
export const EXCLUDED_DIRS = ['.git', '.svn', '.hg', '.bzr'] as const

export function paginate<T>(
  items: T[],
  limit: number | undefined,
  offset: number,
): T[] {
  const windowed = offset > 0 ? items.slice(offset) : items
  if (limit === undefined || limit === 0) return windowed
  return windowed.slice(0, limit)
}

export function truncateToCharBudget(text: string): string {
  if (text.length <= MAX_RESULT_CHARS) return text
  const head = text.slice(0, MAX_RESULT_CHARS)
  const truncatedLines = text.slice(MAX_RESULT_CHARS).split('\n').length
  return `${head}\n\n... [${truncatedLines} lines truncated] ...`
}

export function toProjectRelativeIfPossible(p: string): string {
  const projectRoot = getCwd()
  const rel = relative(projectRoot, p)
  if (!rel || rel === '') return p
  if (rel.startsWith('..')) return p
  if (isAbsolute(rel)) return p
  return rel
}

export function formatPagination(
  limit: number | undefined,
  offset: number | undefined,
): string {
  if (!limit && !offset) return ''
  return `limit: ${limit}, offset: ${offset ?? 0}`
}

export function parseGlobString(glob: string): string[] {
  const parts = glob.split(/\s+/).filter(Boolean)
  const expanded: string[] = []
  for (const part of parts) {
    if (part.includes('{') && part.includes('}')) {
      expanded.push(part)
      continue
    }
    expanded.push(...part.split(',').filter(Boolean))
  }
  return expanded
}
