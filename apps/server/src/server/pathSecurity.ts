import { existsSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'

const rootRealpathByCwd = new Map<string, string>()

function getRootRealpath(projectCwd: string): string {
  const key = projectCwd
  const cached = rootRealpathByCwd.get(key)
  if (cached) return cached
  const resolved = realpathSync(projectCwd)
  rootRealpathByCwd.set(key, resolved)
  return resolved
}

function isPathWithin(parent: string, child: string): boolean {
  const rel = relative(parent, child)
  if (!rel || rel === '') return true
  if (rel.startsWith('..')) return false
  if (isAbsolute(rel)) return false
  return true
}

export function resolveInProjectRoot(projectCwd: string, p: string): string {
  const trimmed = String(p ?? '').trim()
  if (!trimmed) {
    throw new Error('Missing path')
  }
  if (trimmed.includes('\0')) {
    throw new Error('Invalid path')
  }

  const abs = isAbsolute(trimmed)
    ? resolve(trimmed)
    : resolve(projectCwd, trimmed)
  const root = getRootRealpath(projectCwd)

  // If the path exists, resolve symlinks and enforce containment against the real project root.
  if (existsSync(abs)) {
    const real = realpathSync(abs)
    if (!isPathWithin(root, real)) {
      throw new Error('Path is outside of the current project directory')
    }
    return real
  }

  // For non-existent paths (e.g. creating a new file), validate the real parent directory.
  const realParent = realpathSync(dirname(abs))
  if (!isPathWithin(root, realParent)) {
    throw new Error('Path is outside of the current project directory')
  }

  // Return the non-realpath value so callers can create it.
  return abs
}

export function toGitPath(projectCwd: string, p: string): string {
  const abs = resolveInProjectRoot(projectCwd, p)
  const root = getRootRealpath(projectCwd)
  const rel = relative(root, abs)
  return rel.split(sep).join('/')
}
