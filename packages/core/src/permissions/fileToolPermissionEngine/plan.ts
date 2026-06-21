import path from 'path'
import { tmpdir } from 'os'

import type { ToolUseContext } from '#core/tooling/Tool'
import { PRODUCT_NAME } from '#core/constants/product'
import { getKodeBaseDir } from '#core/utils/env'
import { getPlanConversationKey, getPlanFilePath } from '#core/utils/planMode'
import { getOriginalCwd } from '#core/utils/state'
import { getKodeAgentSessionId } from '#protocol/utils/kodeAgentSessionId'
import { getClaudeCompatRoots } from '#config/dataRoots'
import { LEGACY_ENV } from '#config/compat/legacyEnv'
import { resolveSandboxTmpDir } from '#runtime/shell/sandboxEnv'

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

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values))
}

function expandPosixCandidates(inputPath: string): string[] {
  const resolved = resolveLikeCliPath(inputPath)
  const candidates = expandSymlinkPaths(resolved)
  return uniqueStrings(candidates.map(p => toPosixPath(resolveLikeCliPath(p))))
}

function isPosixPathWithinDir(posixPath: string, dirPosix: string): boolean {
  return (
    posixPath === dirPosix || posixPath.startsWith(`${dirPosix}${POSIX_SEP}`)
  )
}

function areAllPathCandidatesWithinAllowedDirs(args: {
  pathCandidatesPosix: string[]
  allowedDirCandidatesPosix: string[]
}): boolean {
  return args.pathCandidatesPosix.every(candidate =>
    args.allowedDirCandidatesPosix.some(dir =>
      isPosixPathWithinDir(candidate, dir),
    ),
  )
}

function isPathWithinAnyAllowedDir(args: {
  inputPath: string
  allowedDirs: string[]
}): boolean {
  const pathCandidatesPosix = expandPosixCandidates(args.inputPath)
  const allowedDirCandidatesPosix = uniqueStrings(
    args.allowedDirs.flatMap(dir => expandPosixCandidates(dir)),
  )

  if (allowedDirCandidatesPosix.length === 0) return false
  return areAllPathCandidatesWithinAllowedDirs({
    pathCandidatesPosix,
    allowedDirCandidatesPosix,
  })
}

function getProjectKeyFromCwd(): string {
  return getOriginalCwd().replace(/[^a-zA-Z0-9]/g, '-')
}

function getLegacyTmpBaseDir(): string {
  const override = process.env[LEGACY_ENV.codeTmpDir]
  if (typeof override === 'string') {
    const trimmed = override.trim()
    if (trimmed) return trimmed
  }
  if (process.platform === 'win32') {
    return process.env.TEMP?.trim() || tmpdir()
  }
  return '/tmp'
}

function getLegacyClaudeTmpDir(): string {
  const override = process.env[LEGACY_ENV.tmpDir]
  if (typeof override === 'string') {
    const trimmed = override.trim().replace(/[\\/]+$/, '')
    if (trimmed) return trimmed
  }
  return path.join(getLegacyTmpBaseDir(), 'claude')
}

function getScratchpadDirForCurrentSession(args: {
  projectKey: string
  sessionId: string
}): string {
  return path.join(
    resolveSandboxTmpDir(),
    args.projectKey,
    args.sessionId,
    'scratchpad',
  )
}

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

export function getSpecialAllowedWriteReason(args: {
  inputPath: string
  context: ToolUseContext
}): string | null {
  const absolute = resolveLikeCliPath(args.inputPath)

  if (isPlanFileForContext({ inputPath: absolute, context: args.context })) {
    return 'Plan files for current session are allowed for writing'
  }

  const projectKey = getProjectKeyFromCwd()
  const sessionId = getKodeAgentSessionId()
  const scratchpadDir = resolveLikeCliPath(
    getScratchpadDirForCurrentSession({ projectKey, sessionId }),
  )

  if (
    isPathWithinAnyAllowedDir({
      inputPath: absolute,
      allowedDirs: [scratchpadDir],
    })
  ) {
    return 'Scratchpad files for current session are allowed for writing'
  }

  return null
}

export function isSpecialAllowedWritePathForContext(args: {
  inputPath: string
  context: ToolUseContext
}): boolean {
  return getSpecialAllowedWriteReason(args) !== null
}

export function getSpecialAllowedReadReason(args: {
  inputPath: string
  context: ToolUseContext
}): string | null {
  const absolute = resolveLikeCliPath(args.inputPath)
  const conversationKey = getPlanConversationKey(args.context)

  const baseDirResolved = resolveLikeCliPath(getKodeBaseDir())
  const projectDir = getProjectKeyFromCwd()
  const sessionId = getKodeAgentSessionId()
  const claudeCompatRoots = getClaudeCompatRoots().map(root =>
    resolveLikeCliPath(root),
  )
  const sessionRoots = uniqueStrings([baseDirResolved, ...claudeCompatRoots])

  const bashOutputsDir = resolveLikeCliPath(
    path.join(baseDirResolved, 'bash-outputs', conversationKey),
  )
  if (
    isPathWithinAnyAllowedDir({
      inputPath: absolute,
      allowedDirs: [bashOutputsDir],
    })
  ) {
    return 'Bash output files from current session are allowed for reading'
  }

  if (isPlanFileForContext({ inputPath: absolute, context: args.context })) {
    return 'Plan files for current session are allowed for reading'
  }

  const memoryDir = resolveLikeCliPath(path.join(baseDirResolved, 'memory'))
  if (
    isPathWithinAnyAllowedDir({ inputPath: absolute, allowedDirs: [memoryDir] })
  ) {
    return 'Session memory files are allowed for reading'
  }

  const sessionMemoryDirs = sessionRoots.map(root =>
    resolveLikeCliPath(
      path.join(root, 'projects', projectDir, sessionId, 'session-memory'),
    ),
  )
  if (
    isPathWithinAnyAllowedDir({
      inputPath: absolute,
      allowedDirs: sessionMemoryDirs,
    })
  ) {
    return 'Session memory files are allowed for reading'
  }

  const toolResultsDir = resolveLikeCliPath(
    path.join(baseDirResolved, 'tool-results', conversationKey),
  )
  if (
    isPathWithinAnyAllowedDir({
      inputPath: absolute,
      allowedDirs: [toolResultsDir],
    })
  ) {
    return 'Tool result files are allowed for reading'
  }

  const sessionToolResultsDir = resolveLikeCliPath(
    path.join(
      baseDirResolved,
      'projects',
      projectDir,
      sessionId,
      'tool-results',
    ),
  )
  if (
    isPathWithinAnyAllowedDir({
      inputPath: absolute,
      allowedDirs: [sessionToolResultsDir],
    })
  ) {
    return 'Tool result files are allowed for reading'
  }

  const scratchpadDir = resolveLikeCliPath(
    getScratchpadDirForCurrentSession({ projectKey: projectDir, sessionId }),
  )
  if (
    isPathWithinAnyAllowedDir({
      inputPath: absolute,
      allowedDirs: [scratchpadDir],
    })
  ) {
    return 'Scratchpad files for current session are allowed for reading'
  }

  const tasksDir = resolveLikeCliPath(
    path.join(baseDirResolved, projectDir, 'tasks'),
  )
  if (
    isPathWithinAnyAllowedDir({ inputPath: absolute, allowedDirs: [tasksDir] })
  ) {
    return 'Project temp directory files are allowed for reading'
  }

  const kodeTmpTasksDir = resolveLikeCliPath(
    path.join(resolveSandboxTmpDir(), projectDir, 'tasks'),
  )
  if (
    isPathWithinAnyAllowedDir({
      inputPath: absolute,
      allowedDirs: [kodeTmpTasksDir],
    })
  ) {
    return 'Project temp directory files are allowed for reading'
  }

  const legacyTasksDir = resolveLikeCliPath(
    path.join(getLegacyClaudeTmpDir(), projectDir, 'tasks'),
  )
  if (
    isPathWithinAnyAllowedDir({
      inputPath: absolute,
      allowedDirs: [legacyTasksDir],
    })
  ) {
    return 'Project temp directory files are allowed for reading'
  }

  return null
}
