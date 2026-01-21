import { homedir } from 'os'
import path from 'path'
import type { ToolPermissionContext } from '#core/types/toolPermissionContext'
import { getOriginalCwd } from '#core/utils/state'
import { PRODUCT_NAME } from '#core/constants/product'
import {
  getWriteSafetyCheckForPath,
  isPathInWorkingDirectories,
  matchPermissionRuleForPath,
  resolveLikeCliPath,
  suggestFilePermissionUpdates,
} from '../fileToolPermissionEngine'
import type {
  BashPathOp,
  BashPermissionDecision,
  DecisionReason,
  Redirection,
} from './types'
import { stripOutputRedirections } from './redirections'
import {
  isGlobToken,
  parseShellTokens,
  restoreShellStringToken,
  splitBashCommandIntoSubcommands,
} from './shellTokens'
import {
  COMMAND_DESCRIPTIONS,
  COMMAND_PATH_BEHAVIOR,
  PATH_COMMAND_ARG_EXTRACTORS,
  PATH_COMMANDS,
} from './pathCommands'

const WILDCARD_PATTERN = /[*?[\]{}]/
type PathPermissionCheck = {
  allowed: boolean
  resolvedPath: string
  decisionReason?: DecisionReason
}
function stripQuotes(value: string): string {
  return value.replace(/^['"]|['"]$/g, '')
}
function getAllowedWorkingDirectories(
  context: ToolPermissionContext,
): string[] {
  return [
    resolveLikeCliPath(getOriginalCwd()),
    ...Array.from(context.additionalWorkingDirectories.keys()),
  ]
}
function formatAllowedDirs(dirs: string[], max = 5): string {
  const count = dirs.length
  if (count <= max) return dirs.map(d => `'${d}'`).join(', ')
  return `${dirs
    .slice(0, max)
    .map(d => `'${d}'`)
    .join(', ')}, and ${count - max} more`
}
function resolveTildeLikeShell(value: string): string {
  if (value === '~' || value.startsWith('~/')) {
    return homedir() + value.slice(1)
  }
  return value
}

function baseDirForGlobPattern(pattern: string): string {
  const match = pattern.match(WILDCARD_PATTERN)
  if (!match || match.index === undefined) return pattern
  const before = pattern.slice(0, match.index)
  const lastSlash = before.lastIndexOf('/')
  if (lastSlash === -1) return '.'
  return before.slice(0, lastSlash) || '/'
}

function checkPathPermission(
  resolvedPath: string,
  toolPermissionContext: ToolPermissionContext,
  op: BashPathOp,
): { allowed: boolean; decisionReason?: DecisionReason } {
  const operation = op === 'read' ? 'read' : 'edit'

  const deniedRule = matchPermissionRuleForPath({
    inputPath: resolvedPath,
    toolPermissionContext,
    operation,
    behavior: 'deny',
  })
  if (deniedRule)
    return {
      allowed: false,
      decisionReason: { type: 'rule', rule: deniedRule },
    }

  if (op !== 'read') {
    const safety = getWriteSafetyCheckForPath(resolvedPath)
    if ('message' in safety) {
      return {
        allowed: false,
        decisionReason: { type: 'other', reason: safety.message },
      }
    }
  }

  if (isPathInWorkingDirectories(resolvedPath, toolPermissionContext))
    return { allowed: true }

  const allowRule = matchPermissionRuleForPath({
    inputPath: resolvedPath,
    toolPermissionContext,
    operation,
    behavior: 'allow',
  })
  if (allowRule)
    return { allowed: true, decisionReason: { type: 'rule', rule: allowRule } }

  return { allowed: false }
}

function checkPathArgAllowed(
  rawPath: string,
  cwd: string,
  toolPermissionContext: ToolPermissionContext,
  op: BashPathOp,
): PathPermissionCheck {
  const unquoted = resolveTildeLikeShell(stripQuotes(rawPath))

  if (unquoted.includes('$') || unquoted.includes('%')) {
    return {
      allowed: false,
      resolvedPath: unquoted,
      decisionReason: {
        type: 'other',
        reason: 'Shell expansion syntax in paths requires manual approval',
      },
    }
  }

  if (WILDCARD_PATTERN.test(unquoted)) {
    if (op === 'write' || op === 'create') {
      return {
        allowed: false,
        resolvedPath: unquoted,
        decisionReason: {
          type: 'other',
          reason:
            'Glob patterns are not allowed in write operations. Please specify an exact file path.',
        },
      }
    }

    const base = /(?:^|[\\/])\.\.(?:[\\/]|$)/.test(unquoted)
      ? unquoted
      : baseDirForGlobPattern(unquoted)
    const abs = path.isAbsolute(base) ? base : path.resolve(cwd, base)
    const resolved = resolveLikeCliPath(abs)
    const check = checkPathPermission(resolved, toolPermissionContext, op)
    return {
      allowed: check.allowed,
      resolvedPath: resolved,
      decisionReason: check.decisionReason,
    }
  }

  const abs = path.isAbsolute(unquoted) ? unquoted : path.resolve(cwd, unquoted)
  const resolved = resolveLikeCliPath(abs)
  const check = checkPathPermission(resolved, toolPermissionContext, op)
  return {
    allowed: check.allowed,
    resolvedPath: resolved,
    decisionReason: check.decisionReason,
  }
}

function isCriticalRemovalTarget(absPath: string): boolean {
  if (absPath === '*' || absPath.endsWith('/*')) return true

  const normalized = absPath === '/' ? absPath : absPath.replace(/\/$/, '')
  if (normalized === '/') return true

  const home = homedir()
  if (normalized === home) return true

  if (path.posix.dirname(normalized) === '/') return true
  return false
}

function validatePathRestrictedCommand(
  baseCommand: string,
  args: string[],
  cwd: string,
  toolPermissionContext: ToolPermissionContext,
  hasCdInCompound: boolean,
): BashPermissionDecision {
  const op = COMMAND_PATH_BEHAVIOR[baseCommand]
  if (!op)
    return {
      behavior: 'passthrough',
      message: 'Command is not path-restricted',
    }

  const extractor = PATH_COMMAND_ARG_EXTRACTORS[baseCommand]
  const extracted = extractor ? extractor(args) : []

  if (hasCdInCompound && op !== 'read') {
    return {
      behavior: 'ask',
      message:
        "Commands that change directories and perform write operations require explicit approval to ensure paths are evaluated correctly. For security, Kode Agent cannot automatically determine the final working directory when 'cd' is used in compound commands.",
      decisionReason: {
        type: 'other',
        reason:
          'Compound command contains cd with write operation - manual approval required to prevent path resolution bypass',
      },
    }
  }

  for (const rawPath of extracted) {
    const check = checkPathArgAllowed(rawPath, cwd, toolPermissionContext, op)
    if (!check.allowed) {
      const allowedDirs = getAllowedWorkingDirectories(toolPermissionContext)
      const formatted = formatAllowedDirs(allowedDirs)
      const fallback =
        check.decisionReason?.type === 'other'
          ? check.decisionReason.reason
          : `${baseCommand} in '${check.resolvedPath}' was blocked. For security, ${PRODUCT_NAME} may only ${COMMAND_DESCRIPTIONS[baseCommand] ?? 'access'} the allowed working directories for this session: ${formatted}.`

      if (check.decisionReason?.type === 'rule') {
        return {
          behavior: 'deny',
          message: fallback,
          decisionReason: check.decisionReason,
        }
      }

      return {
        behavior: 'ask',
        message: fallback,
        blockedPath: check.resolvedPath,
        decisionReason: check.decisionReason,
      }
    }
  }

  if (baseCommand === 'rm' || baseCommand === 'rmdir') {
    for (const rawPath of extracted) {
      const unquoted = resolveTildeLikeShell(stripQuotes(rawPath))
      const abs = path.isAbsolute(unquoted)
        ? unquoted
        : path.resolve(cwd, unquoted)
      const resolved = resolveLikeCliPath(abs)
      if (isCriticalRemovalTarget(resolved)) {
        return {
          behavior: 'ask',
          message: `Dangerous ${baseCommand} operation detected: '${resolved}'\n\nThis command would remove a critical system directory. This requires explicit approval and cannot be auto-allowed by permission rules.`,
          decisionReason: {
            type: 'other',
            reason: `Dangerous ${baseCommand} operation on critical path: ${resolved}`,
          },
          suggestions: [],
        }
      }
    }
  }

  return {
    behavior: 'passthrough',
    message: `Path validation passed for ${baseCommand} command`,
  }
}

function parseCommandPathArgs(command: string): string[] {
  const parsed = parseShellTokens(command)
  if (!parsed.success) return []
  const out: string[] = []
  for (const token of parsed.tokens) {
    if (typeof token === 'string') out.push(restoreShellStringToken(token))
    else if (isGlobToken(token)) out.push(token.pattern)
  }
  return out
}

function validateOutputRedirections(
  redirections: Redirection[],
  cwd: string,
  toolPermissionContext: ToolPermissionContext,
  hasCdInCompound: boolean,
): BashPermissionDecision {
  if (hasCdInCompound && redirections.length > 0) {
    return {
      behavior: 'ask',
      message:
        "Commands that change directories and write via output redirection require explicit approval to ensure paths are evaluated correctly. For security, Kode Agent cannot automatically determine the final working directory when 'cd' is used in compound commands.",
      decisionReason: {
        type: 'other',
        reason:
          'Compound command contains cd with output redirection - manual approval required to prevent path resolution bypass',
      },
    }
  }

  for (const { target } of redirections) {
    if (target === '/dev/null') continue
    const check = checkPathArgAllowed(
      target,
      cwd,
      toolPermissionContext,
      'create',
    )
    if (!check.allowed) {
      const allowedDirs = getAllowedWorkingDirectories(toolPermissionContext)
      const formatted = formatAllowedDirs(allowedDirs)
      const message =
        check.decisionReason?.type === 'other'
          ? check.decisionReason.reason
          : check.decisionReason?.type === 'rule'
            ? `Output redirection to '${check.resolvedPath}' was blocked by a deny rule.`
            : `Output redirection to '${check.resolvedPath}' was blocked. For security, ${PRODUCT_NAME} may only write to files in the allowed working directories for this session: ${formatted}.`

      if (check.decisionReason?.type === 'rule') {
        return {
          behavior: 'deny',
          message,
          decisionReason: check.decisionReason,
        }
      }

      return {
        behavior: 'ask',
        message,
        blockedPath: check.resolvedPath,
        suggestions: suggestFilePermissionUpdates({
          inputPath: check.resolvedPath,
          operation: 'create',
          toolPermissionContext,
        }),
      }
    }
  }

  return { behavior: 'passthrough', message: 'No unsafe redirections found' }
}

export function validateBashCommandPaths(args: {
  command: string
  cwd: string
  toolPermissionContext: ToolPermissionContext
  hasCdInCompound: boolean
}): BashPermissionDecision {
  if (/(?:>>?)\s*\S*[$%]/.test(args.command)) {
    return {
      behavior: 'ask',
      message: 'Shell expansion syntax in paths requires manual approval',
      decisionReason: {
        type: 'other',
        reason: 'Shell expansion syntax in paths requires manual approval',
      },
    }
  }

  const { redirections } = stripOutputRedirections(args.command)
  const redirectionDecision = validateOutputRedirections(
    redirections,
    args.cwd,
    args.toolPermissionContext,
    args.hasCdInCompound,
  )
  if (redirectionDecision.behavior !== 'passthrough') return redirectionDecision

  const subcommands = splitBashCommandIntoSubcommands(args.command)
  for (const subcommand of subcommands) {
    const parts = parseCommandPathArgs(subcommand)
    const [base, ...rest] = parts
    if (!base || !PATH_COMMANDS.has(base)) continue
    const decision = validatePathRestrictedCommand(
      base,
      rest,
      args.cwd,
      args.toolPermissionContext,
      args.hasCdInCompound,
    )
    if (decision.behavior === 'ask' || decision.behavior === 'deny') {
      if (decision.behavior === 'ask' && decision.blockedPath) {
        const op = COMMAND_PATH_BEHAVIOR[base]
        if (op) {
          decision.suggestions = suggestFilePermissionUpdates({
            inputPath: decision.blockedPath,
            operation: op,
            toolPermissionContext: args.toolPermissionContext,
          })
        }
      }
      return decision
    }
  }

  return {
    behavior: 'passthrough',
    message: 'All path commands validated successfully',
  }
}
