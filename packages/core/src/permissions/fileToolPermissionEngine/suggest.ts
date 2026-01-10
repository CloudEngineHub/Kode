import { statSync } from 'fs'
import path from 'path'

import type {
  ToolPermissionContext,
  ToolPermissionContextUpdate,
} from '#core/types/toolPermissionContext'

import {
  expandSymlinkPaths,
  isPathInWorkingDirectories,
  resolveLikeCliPath,
  toPosixPath,
} from './paths'

const POSIX = path.posix
const POSIX_SEP = POSIX.sep

function getDirectoryForSuggestions(inputPath: string): string {
  const absolute = resolveLikeCliPath(inputPath)
  try {
    if (statSync(absolute).isDirectory()) return absolute
  } catch {
    // fall through
  }
  return path.dirname(absolute)
}

function makeReadAllowRuleForDirectory(dirPath: string): string | null {
  try {
    if (!statSync(dirPath).isDirectory()) return null
  } catch {
    return null
  }

  const posixDir = toPosixPath(dirPath)
  if (posixDir === POSIX_SEP) return null

  const ruleContent = POSIX.isAbsolute(posixDir)
    ? `/${posixDir}/**`
    : `${posixDir}/**`
  return `Read(${ruleContent})`
}

export function suggestFilePermissionUpdates(args: {
  inputPath: string
  operation: 'read' | 'write' | 'create'
  toolPermissionContext: ToolPermissionContext
}): ToolPermissionContextUpdate[] {
  const isOutsideWorkingDirs = !isPathInWorkingDirectories(
    args.inputPath,
    args.toolPermissionContext,
  )

  if (args.operation === 'read' && isOutsideWorkingDirs) {
    const dirPath = getDirectoryForSuggestions(args.inputPath)
    return expandSymlinkPaths(dirPath).flatMap(dir => {
      const rule = makeReadAllowRuleForDirectory(dir)
      if (!rule) return []
      const update: ToolPermissionContextUpdate = {
        type: 'addRules',
        behavior: 'allow',
        destination: 'session',
        rules: [rule],
      }
      return [update]
    })
  }

  if (args.operation === 'write' || args.operation === 'create') {
    const updates: ToolPermissionContextUpdate[] = [
      { type: 'setMode', mode: 'acceptEdits', destination: 'session' },
    ]
    if (isOutsideWorkingDirs) {
      const dirPath = getDirectoryForSuggestions(args.inputPath)
      updates.push({
        type: 'addDirectories',
        directories: expandSymlinkPaths(dirPath),
        destination: 'session',
      })
    }
    return updates
  }

  return [{ type: 'setMode', mode: 'acceptEdits', destination: 'session' }]
}
