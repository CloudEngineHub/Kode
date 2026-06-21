import type { ToolPermissionContext } from '#core/types/toolPermissionContext'
import type {
  ToolPermissionRuleBehavior,
  ToolPermissionUpdateDestination,
} from '#core/types/toolPermissionContext'
import {
  describeToolPermissionRuleSource,
  parseToolPermissionRuleValue,
} from './ruleString'

type ParsedBashMatcher =
  | { type: 'all' }
  | { type: 'exact'; command: string }
  | { type: 'prefix'; prefix: string }
  | { type: 'wildcard'; pattern: string; prefix?: string }

export type UnreachablePermissionRuleWarning = {
  source: ToolPermissionUpdateDestination
  behavior: ToolPermissionRuleBehavior
  rule: string
  reason: string
  fix: string
}

const SOURCE_ORDER: ToolPermissionUpdateDestination[] = [
  'cliArg',
  'command',
  'session',
  'localSettings',
  'projectSettings',
  'userSettings',
  'flagSettings',
  'policySettings',
]

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function extractTrailingWildcardPrefix(pattern: string): string | null {
  const normalized = normalizeWhitespace(pattern)
  if (!normalized.endsWith('*')) return null
  const withoutStar = normalized.slice(0, -1)
  if (withoutStar.includes('*')) return null
  return withoutStar
}

function parseBashMatcher(rule: string): ParsedBashMatcher | null {
  const parsed = parseToolPermissionRuleValue(rule)
  if (parsed.toolName !== 'Bash') return null

  if (!parsed.ruleContent) return { type: 'all' }

  const normalized = normalizeWhitespace(
    parsed.ruleContent.replace(/\s*\[background\]\s*$/i, ''),
  )
  if (!normalized) return { type: 'all' }
  if (normalized === '*') return { type: 'all' }

  const prefixMatch = normalized.match(/^(.+):\*$/)
  if (prefixMatch && prefixMatch[1]) {
    return { type: 'prefix', prefix: normalizeWhitespace(prefixMatch[1]) }
  }

  if (normalized.includes('*')) {
    return {
      type: 'wildcard',
      pattern: normalized,
      prefix: extractTrailingWildcardPrefix(normalized) ?? undefined,
    }
  }

  return { type: 'exact', command: normalized }
}

function matcherSubsumes(a: ParsedBashMatcher, b: ParsedBashMatcher): boolean {
  if (a.type === 'all') return true
  if (b.type === 'all') return false

  if (a.type === 'exact') {
    if (b.type === 'exact') return a.command === b.command
    return false
  }

  if (a.type === 'prefix') {
    const p = a.prefix
    switch (b.type) {
      case 'exact':
        return b.command === p || b.command.startsWith(`${p} `)
      case 'prefix':
        return b.prefix === p || b.prefix.startsWith(`${p} `)
      case 'wildcard':
        return false
    }
  }

  if (a.type === 'wildcard') {
    if (b.type === 'wildcard') return a.pattern === b.pattern
    if (b.type === 'exact') {
      if (a.prefix !== undefined) {
        return b.command.startsWith(a.prefix)
      }
      return false
    }
    if (b.type === 'prefix') {
      if (a.prefix !== undefined) {
        return b.prefix.startsWith(a.prefix)
      }
      return false
    }
  }

  return false
}

type RuleEntry = {
  source: ToolPermissionUpdateDestination
  behavior: ToolPermissionRuleBehavior
  rule: string
}

function collectRuleEntries(args: {
  context: ToolPermissionContext
  behavior: ToolPermissionRuleBehavior
}): RuleEntry[] {
  const groups =
    args.behavior === 'allow'
      ? args.context.alwaysAllowRules
      : args.behavior === 'deny'
        ? args.context.alwaysDenyRules
        : args.context.alwaysAskRules

  const out: RuleEntry[] = []
  for (const source of SOURCE_ORDER) {
    const rules = groups[source]
    if (!Array.isArray(rules)) continue
    for (const rule of rules) {
      if (typeof rule !== 'string') continue
      const trimmed = rule.trim()
      if (!trimmed) continue
      out.push({ source, behavior: args.behavior, rule: trimmed })
    }
  }
  return out
}

function ruleLabel(entry: RuleEntry): string {
  const sourceLabel = describeToolPermissionRuleSource(entry.source)
  return `${entry.rule} (${sourceLabel}, ${entry.behavior})`
}

function findUnreachableBashRules(
  context: ToolPermissionContext,
): UnreachablePermissionRuleWarning[] {
  const deny = collectRuleEntries({ context, behavior: 'deny' })
  const ask = collectRuleEntries({ context, behavior: 'ask' })
  const allow = collectRuleEntries({ context, behavior: 'allow' })

  const parsedDeny = deny
    .map(entry => ({ entry, matcher: parseBashMatcher(entry.rule) }))
    .filter(
      (item): item is { entry: RuleEntry; matcher: ParsedBashMatcher } =>
        item.matcher !== null,
    )
  const parsedAsk = ask
    .map(entry => ({ entry, matcher: parseBashMatcher(entry.rule) }))
    .filter(
      (item): item is { entry: RuleEntry; matcher: ParsedBashMatcher } =>
        item.matcher !== null,
    )
  const parsedAllow = allow
    .map(entry => ({ entry, matcher: parseBashMatcher(entry.rule) }))
    .filter(
      (item): item is { entry: RuleEntry; matcher: ParsedBashMatcher } =>
        item.matcher !== null,
    )

  const warnings: UnreachablePermissionRuleWarning[] = []

  const denyMatchers = parsedDeny.map(_ => _.matcher)
  const askMatchers = parsedAsk.map(_ => _.matcher)

  for (let i = 0; i < parsedDeny.length; i += 1) {
    const current = parsedDeny[i]
    for (let j = 0; j < i; j += 1) {
      const prev = parsedDeny[j]
      if (!matcherSubsumes(prev.matcher, current.matcher)) continue
      warnings.push({
        source: current.entry.source,
        behavior: 'deny',
        rule: current.entry.rule,
        reason: `Covered by an earlier deny rule: ${ruleLabel(prev.entry)}`,
        fix: 'Remove the redundant rule, or narrow the earlier rule.',
      })
      break
    }
  }

  for (let i = 0; i < parsedAsk.length; i += 1) {
    const current = parsedAsk[i]

    const deniedBy = parsedDeny.find(prev =>
      matcherSubsumes(prev.matcher, current.matcher),
    )
    if (deniedBy) {
      warnings.push({
        source: current.entry.source,
        behavior: 'ask',
        rule: current.entry.rule,
        reason: `Always denied by: ${ruleLabel(deniedBy.entry)}`,
        fix: 'Remove the ask rule, or narrow the deny rule.',
      })
      continue
    }

    for (let j = 0; j < i; j += 1) {
      const prev = parsedAsk[j]
      if (!matcherSubsumes(prev.matcher, current.matcher)) continue
      warnings.push({
        source: current.entry.source,
        behavior: 'ask',
        rule: current.entry.rule,
        reason: `Covered by an earlier ask rule: ${ruleLabel(prev.entry)}`,
        fix: 'Remove the redundant rule, or narrow the earlier rule.',
      })
      break
    }
  }

  for (let i = 0; i < parsedAllow.length; i += 1) {
    const current = parsedAllow[i]

    const deniedBy = parsedDeny.find(prev =>
      matcherSubsumes(prev.matcher, current.matcher),
    )
    if (deniedBy) {
      warnings.push({
        source: current.entry.source,
        behavior: 'allow',
        rule: current.entry.rule,
        reason: `Always denied by: ${ruleLabel(deniedBy.entry)}`,
        fix: 'Remove the allow rule, or narrow the deny rule.',
      })
      continue
    }

    const askedBy = parsedAsk.find(prev =>
      matcherSubsumes(prev.matcher, current.matcher),
    )
    if (askedBy) {
      warnings.push({
        source: current.entry.source,
        behavior: 'allow',
        rule: current.entry.rule,
        reason: `Always prompts by: ${ruleLabel(askedBy.entry)}`,
        fix: 'Remove the allow rule, or narrow the ask rule.',
      })
      continue
    }

    for (let j = 0; j < i; j += 1) {
      const prev = parsedAllow[j]
      if (!matcherSubsumes(prev.matcher, current.matcher)) continue
      warnings.push({
        source: current.entry.source,
        behavior: 'allow',
        rule: current.entry.rule,
        reason: `Covered by an earlier allow rule: ${ruleLabel(prev.entry)}`,
        fix: 'Remove the redundant rule, or narrow the earlier rule.',
      })
      break
    }
  }

  return warnings
}

export function findUnreachablePermissionRules(
  context: ToolPermissionContext,
): UnreachablePermissionRuleWarning[] {
  return [...findUnreachableBashRules(context)]
}
