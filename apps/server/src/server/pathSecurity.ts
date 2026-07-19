import { lstatSync, realpathSync, statSync } from 'node:fs'
import {
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from 'node:path'

function getRootRealpath(projectCwd: string): string {
  // Resolve the root for every request. Caching this value makes a stale
  // symlink/junction target part of a future authorization decision.
  return realpathSync(projectCwd)
}

function isPathWithin(parent: string, child: string): boolean {
  const rel = relative(parent, child)
  if (!rel || rel === '') return true
  if (rel === '..' || rel.startsWith(`..${sep}`)) return false
  if (isAbsolute(rel)) return false
  return true
}

function hasGitMetadataSegment(
  projectRoot: string,
  candidate: string,
): boolean {
  const rel = relative(projectRoot, candidate)
  return rel.split(/[\\/]+/).some(segment => segment.toLowerCase() === '.git')
}

function assertWithinProjectRoot(projectRoot: string, candidate: string): void {
  if (!isPathWithin(projectRoot, candidate)) {
    throw new Error('Path is outside of the current project directory')
  }
  if (hasGitMetadataSegment(projectRoot, candidate)) {
    throw new Error('Access to .git is not allowed')
  }
}

type ExistingParent = {
  path: string
  missingSegments: string[]
}

function findNearestExistingParent(target: string): ExistingParent {
  let candidate = target
  const missingSegments: string[] = []

  // lstat, rather than existsSync, also finds a dangling symlink. That lets
  // us reject it when realpath fails instead of treating its parent as safe.
  while (true) {
    try {
      lstatSync(candidate)
      return { path: candidate, missingSegments }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code !== 'ENOENT' && code !== 'ENOTDIR') throw err
    }

    const parent = dirname(candidate)
    if (parent === candidate) {
      throw new Error('Path does not have an existing parent directory')
    }

    missingSegments.unshift(basename(candidate))
    candidate = parent
  }
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

  const nearestParent = findNearestExistingParent(abs)
  const realParent = realpathSync(nearestParent.path)
  assertWithinProjectRoot(root, realParent)

  if (nearestParent.missingSegments.length === 0) {
    return realParent
  }

  if (!statSync(realParent).isDirectory()) {
    throw new Error('Path parent is not a directory')
  }

  // Rebuild from the real parent so callers create through the verified path,
  // not through a lexical symlink/junction that could point elsewhere.
  const target = resolve(realParent, ...nearestParent.missingSegments)
  assertWithinProjectRoot(root, target)
  return target
}

export function toGitPath(projectCwd: string, p: string): string {
  const abs = resolveInProjectRoot(projectCwd, p)
  const root = getRootRealpath(projectCwd)
  const rel = relative(root, abs)
  return rel.split(sep).join('/')
}
