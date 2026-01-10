import path from 'path'

import type { ToolUseContext } from '#core/tooling/Tool'
import { PRODUCT_NAME } from '#core/constants/product'
import { getKodeBaseDir } from '#core/utils/env'
import { getPlanConversationKey, getPlanFilePath } from '#core/utils/planMode'

import {
  expandSymlinkPaths,
  hasSuspiciousWindowsPathPattern,
  isSensitiveFilePath,
  isWriteProtectedPath,
  resolveLikeCliPath,
  toPosixPath,
} from './paths'

const POSIX = path.posix
const POSIX_SEP = POSIX.sep

export function getWriteSafetyCheckForPath(
  inputPath: string,
): { safe: true } | { safe: false; message: string } {
  const candidates = expandSymlinkPaths(inputPath)
  for (const candidate of candidates) {
    if (hasSuspiciousWindowsPathPattern(candidate)) {
      return {
        safe: false,
        message: `${PRODUCT_NAME} requested permissions to write to ${inputPath}, which contains a suspicious Windows path pattern that requires manual approval.`,
      }
    }
  }

  for (const candidate of candidates) {
    if (isWriteProtectedPath(candidate)) {
      return {
        safe: false,
        message: `${PRODUCT_NAME} requested permissions to write to ${inputPath}, but you haven't granted it yet.`,
      }
    }
  }

  for (const candidate of candidates) {
    if (isSensitiveFilePath(candidate)) {
      return {
        safe: false,
        message: `${PRODUCT_NAME} requested permissions to edit ${inputPath} which is a sensitive file.`,
      }
    }
  }

  return { safe: true }
}

export function getPlanFileWritePrivilegeForContext(
  context: ToolUseContext,
): string {
  const conversationKey = getPlanConversationKey(context)
  return getPlanFilePath(context.agentId, conversationKey)
}

export function isPlanFileForContext(args: {
  inputPath: string
  context: ToolUseContext
}): boolean {
  const expected = resolveLikeCliPath(
    getPlanFileWritePrivilegeForContext(args.context),
  )
  const actual = resolveLikeCliPath(args.inputPath)
  return actual === expected
}

export function getSpecialAllowedReadReason(args: {
  inputPath: string
  context: ToolUseContext
}): string | null {
  const absolute = resolveLikeCliPath(args.inputPath)
  const conversationKey = getPlanConversationKey(args.context)

  const baseDirResolved = resolveLikeCliPath(getKodeBaseDir())

  const bashOutputsDir = resolveLikeCliPath(
    path.join(baseDirResolved, 'bash-outputs', conversationKey),
  )
  const bashOutputsDirPosix = toPosixPath(bashOutputsDir)
  const absPosix = toPosixPath(absolute)
  if (
    absPosix === bashOutputsDirPosix ||
    absPosix.startsWith(`${bashOutputsDirPosix}${POSIX_SEP}`)
  ) {
    return 'Bash output files from current session are allowed for reading'
  }

  if (isPlanFileForContext({ inputPath: absolute, context: args.context })) {
    return 'Plan files for current session are allowed for reading'
  }

  const memoryDir = resolveLikeCliPath(path.join(baseDirResolved, 'memory'))
  const memoryDirPosix = toPosixPath(memoryDir)
  if (
    absPosix === memoryDirPosix ||
    absPosix.startsWith(`${memoryDirPosix}${POSIX_SEP}`)
  ) {
    return 'Session memory files are allowed for reading'
  }

  const toolResultsDir = resolveLikeCliPath(
    path.join(baseDirResolved, 'tool-results', conversationKey),
  )
  const toolResultsDirPosix = toPosixPath(toolResultsDir)
  if (
    absPosix === toolResultsDirPosix ||
    absPosix.startsWith(`${toolResultsDirPosix}${POSIX_SEP}`)
  ) {
    return 'Tool result files are allowed for reading'
  }

  const projectDir = process.cwd().replace(/[^a-zA-Z0-9]/g, '-')
  const tasksDir = resolveLikeCliPath(
    path.join(baseDirResolved, projectDir, 'tasks'),
  )
  const tasksDirPosix = toPosixPath(tasksDir)
  if (
    absPosix === tasksDirPosix ||
    absPosix.startsWith(`${tasksDirPosix}${POSIX_SEP}`)
  ) {
    return 'Project temp directory files are allowed for reading'
  }

  return null
}
