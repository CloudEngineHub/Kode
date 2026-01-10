import { resolve, sep } from 'node:path'

import { getCwd } from '#core/utils/state'

export function resolveFromAgentCwd(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return trimmed
  if (trimmed.startsWith('~')) {
    return trimmed
  }
  if (trimmed.startsWith(sep)) return trimmed
  return resolve(getCwd(), trimmed)
}

export function validateRelativePath(path: string): string | null {
  if (!path.startsWith('./')) return 'must start with "./"'
  if (path.split('/').includes('..')) return 'must not contain ".."'
  if (path.includes('\\')) return 'must use forward slashes'
  return null
}

export function safeResolveWithin(baseDir: string, rel: string): string | null {
  const normalized = rel.replace(/\\/g, '/')
  if (!normalized.startsWith('./') || normalized.split('/').includes('..'))
    return null
  const abs = resolve(baseDir, normalized.split('/').join(sep))
  const base = resolve(baseDir)
  if (!abs.startsWith(base + sep) && abs !== base) return null
  return abs
}
