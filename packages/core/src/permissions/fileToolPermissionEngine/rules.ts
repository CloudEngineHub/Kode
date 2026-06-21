import { homedir } from 'os'
import path from 'path'
import ignore, { type Ignore } from 'ignore'

import type {
  ToolPermissionContext,
  ToolPermissionRuleBehavior,
  ToolPermissionUpdateDestination,
} from '#core/types/toolPermissionContext'
import { getCwd, getOriginalCwd } from '#core/utils/state'
import { getKodeBaseDir } from '#core/utils/env'

import { posixRelative, resolveLikeCliPath, toPosixPath } from './paths'

type ToolRuleValue = {
  toolName: string
  ruleContent?: string
}

type ToolRuleEntry = {
  source: ToolPermissionUpdateDestination
  ruleValue: ToolRuleValue
  ruleString: string
}

type FilePermissionOperation = 'read' | 'edit'
type FilePermissionBehavior = ToolPermissionRuleBehavior

const POSIX = path.posix
const POSIX_SEP = POSIX.sep

const READ_RULE_TOOL_NAMES = new Set(['Read', 'LS', 'Glob', 'Grep'])
const EDIT_RULE_TOOL_NAMES = new Set(['Edit', 'Write', 'NotebookEdit'])

function operationToolNames(operation: FilePermissionOperation): Set<string> {
  return operation === 'read' ? READ_RULE_TOOL_NAMES : EDIT_RULE_TOOL_NAMES
}

function parseToolRule(ruleString: string): ToolRuleValue | null {
  if (typeof ruleString !== 'string') return null
  const trimmed = ruleString.trim()
  if (!trimmed) return null
  const openParen = trimmed.indexOf('(')
  if (openParen === -1) return { toolName: trimmed }
  if (!trimmed.endsWith(')')) return null
  const toolName = trimmed.slice(0, openParen)
  const ruleContent = trimmed.slice(openParen + 1, -1).trim()
  if (!toolName) return null
  return { toolName, ruleContent: ruleContent || undefined }
}

function collectRuleEntries(args: {
  context: ToolPermissionContext
  operation: FilePermissionOperation
  behavior: FilePermissionBehavior
}): ToolRuleEntry[] {
  const toolNames = operationToolNames(args.operation)

  const groups =
    args.behavior === 'allow'
      ? args.context.alwaysAllowRules
      : args.behavior === 'deny'
        ? args.context.alwaysDenyRules
        : args.context.alwaysAskRules

  const out: ToolRuleEntry[] = []
  for (const [source, rules] of Object.entries(groups) as Array<
    [ToolPermissionUpdateDestination, string[]]
  >) {
    if (!Array.isArray(rules)) continue
    for (const ruleString of rules) {
      if (typeof ruleString !== 'string') continue
      const parsed = parseToolRule(ruleString)
      if (!parsed) continue
      if (!toolNames.has(parsed.toolName)) continue
      if (!parsed.ruleContent) continue
      out.push({ source, ruleValue: parsed, ruleString })
    }
  }
  return out
}

function rootPathForSource(source: ToolPermissionUpdateDestination): string {
  switch (source) {
    case 'cliArg':
    case 'command':
    case 'session':
      return resolveLikeCliPath(getOriginalCwd())
    case 'userSettings':
      return resolveLikeCliPath(getKodeBaseDir())
    case 'policySettings':
    case 'projectSettings':
    case 'localSettings':
    case 'flagSettings':
      return resolveLikeCliPath(getOriginalCwd())
    default:
      return resolveLikeCliPath(getOriginalCwd())
  }
}

function splitRulePatternByRoot(args: {
  ruleContent: string
  source: ToolPermissionUpdateDestination
}): { relativePattern: string; root: string | null } {
  const pattern = args.ruleContent

  if (pattern.startsWith(`${POSIX_SEP}${POSIX_SEP}`)) {
    const rest = pattern.slice(1)
    if (process.platform === 'win32' && /^\/[a-z]\//i.test(rest)) {
      const driveLetter = rest[1]?.toUpperCase() ?? 'C'
      const remaining = rest.slice(2)
      return {
        relativePattern: remaining.startsWith('/')
          ? remaining.slice(1)
          : remaining,
        root: `${driveLetter}:\\\\`,
      }
    }
    return { relativePattern: rest, root: POSIX_SEP }
  }

  if (pattern.startsWith(`~${POSIX_SEP}`)) {
    return { relativePattern: pattern.slice(1), root: homedir() }
  }

  if (pattern.startsWith(POSIX_SEP)) {
    return { relativePattern: pattern, root: rootPathForSource(args.source) }
  }

  const withoutDot = pattern.startsWith(`.${POSIX_SEP}`)
    ? pattern.slice(2)
    : pattern
  return { relativePattern: withoutDot, root: null }
}

function buildIgnoreMatcher(patterns: string[]): Ignore {
  return ignore().add(patterns)
}

export function matchPermissionRuleForPath(args: {
  inputPath: string
  toolPermissionContext: ToolPermissionContext
  operation: FilePermissionOperation
  behavior: FilePermissionBehavior
}): string | null {
  const resolved = resolveLikeCliPath(args.inputPath)
  const targetPosix = toPosixPath(resolved)

  const entries = collectRuleEntries({
    context: args.toolPermissionContext,
    operation: args.operation,
    behavior: args.behavior,
  })

  const grouped = new Map<string | null, Map<string, ToolRuleEntry>>()
  for (const entry of entries) {
    const { relativePattern, root } = splitRulePatternByRoot({
      ruleContent: entry.ruleValue.ruleContent!,
      source: entry.source,
    })
    const existing = grouped.get(root)
    if (existing) {
      existing.set(relativePattern, entry)
    } else {
      grouped.set(root, new Map([[relativePattern, entry]]))
    }
  }

  for (const [root, patternsMap] of grouped.entries()) {
    const baseRoot = root ?? getCwd()
    const relative = posixRelative(baseRoot, targetPosix)
    if (relative.startsWith(`..${POSIX_SEP}`)) continue
    if (!relative) continue

    const matchAll =
      patternsMap.get('/**')?.ruleString ??
      patternsMap.get('**')?.ruleString ??
      null
    if (matchAll) return matchAll

    const patterns = Array.from(patternsMap.keys()).map(pattern => {
      let candidate = pattern
      if (root === POSIX_SEP && pattern.startsWith(POSIX_SEP)) {
        candidate = pattern.slice(1)
      }
      if (candidate.endsWith('/**')) {
        candidate = candidate.slice(0, -3)
      }
      return candidate
    })

    const matcher = buildIgnoreMatcher(patterns)
    const result = matcher.test(relative)
    if (!result.ignored || !result.rule) continue

    let matched = result.rule.pattern
    const matchedWithGlob = `${matched}/**`
    if (patternsMap.has(matchedWithGlob)) {
      return patternsMap.get(matchedWithGlob)?.ruleString ?? null
    }

    if (root === POSIX_SEP && !matched.startsWith(POSIX_SEP)) {
      matched = `${POSIX_SEP}${matched}`
      const matchedGlob = `${matched}/**`
      if (patternsMap.has(matchedGlob)) {
        return patternsMap.get(matchedGlob)?.ruleString ?? null
      }
      return patternsMap.get(matched)?.ruleString ?? null
    }

    return patternsMap.get(matched)?.ruleString ?? null
  }

  return null
}
