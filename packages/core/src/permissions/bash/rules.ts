import type {
  ToolPermissionContext,
  ToolPermissionContextUpdate,
} from '#core/types/toolPermissionContext'
import { PRODUCT_NAME } from '#core/constants/product'
import type { BashPermissionDecision } from './types'
import { stripOutputRedirections } from './redirections'

type ToolRuleValue = { toolName: string; ruleContent?: string }

function parseToolRuleString(rule: string): ToolRuleValue | null {
  if (typeof rule !== 'string') return null
  const trimmed = rule.trim()
  if (!trimmed) return null
  const open = trimmed.indexOf('(')
  if (open === -1) return { toolName: trimmed }
  if (!trimmed.endsWith(')')) return null
  const toolName = trimmed.slice(0, open)
  const ruleContent = trimmed.slice(open + 1, -1)
  if (!toolName) return null
  return { toolName, ruleContent: ruleContent || undefined }
}

type BashRuleMatchType = 'exact' | 'prefix'

type ParsedBashRuleContent =
  | { type: 'exact'; command: string }
  | { type: 'prefix'; prefix: string }
  | { type: 'wildcard'; pattern: string }

function parseBashRuleContent(ruleContent: string): ParsedBashRuleContent {
  const normalized = ruleContent.trim().replace(/\s*\[background\]\s*$/i, '')
  const match = normalized.match(/^(.+):\*$/)
  if (match && match[1]) return { type: 'prefix', prefix: match[1] }
  if (normalized.includes('*')) return { type: 'wildcard', pattern: normalized }
  return { type: 'exact', command: normalized }
}

type PromptRuleMatchType = 'exact' | 'prefix'

type ParsedPromptRuleContent =
  | { type: 'exact'; text: string }
  | { type: 'prefix'; prefix: string }
  | { type: 'wildcard'; pattern: string }

function normalizePromptForRuleMatch(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase()
}

function parsePromptRuleContent(ruleContent: string): ParsedPromptRuleContent {
  const normalized = normalizePromptForRuleMatch(ruleContent)
  const match = normalized.match(/^(.+):\*$/)
  if (match && match[1]) return { type: 'prefix', prefix: match[1] }
  if (normalized.includes('*')) return { type: 'wildcard', pattern: normalized }
  return { type: 'exact', text: normalized }
}

function normalizeBashCommandForRuleMatch(command: string): string {
  return command.trim().replace(/\s+/g, ' ')
}

function escapeRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function wildcardPatternToRegExp(pattern: string): RegExp {
  // Match the whole normalized command. `*` matches any substring (including spaces).
  const normalizedPattern = normalizeBashCommandForRuleMatch(pattern)
  const parts = normalizedPattern.split('*').map(escapeRegexLiteral)
  return new RegExp(`^${parts.join('.*')}$`)
}

function wildcardPromptPatternToRegExp(pattern: string): RegExp {
  const normalizedPattern = normalizePromptForRuleMatch(pattern)
  const parts = normalizedPattern.split('*').map(escapeRegexLiteral)
  return new RegExp(`^${parts.join('.*')}$`)
}

function collectBashRuleStrings(
  context: ToolPermissionContext,
  behavior: 'allow' | 'deny' | 'ask',
): string[] {
  const groups =
    behavior === 'allow'
      ? context.alwaysAllowRules
      : behavior === 'deny'
        ? context.alwaysDenyRules
        : context.alwaysAskRules
  const out: string[] = []
  for (const rules of Object.values(groups)) {
    if (!Array.isArray(rules)) continue
    for (const rule of rules) if (typeof rule === 'string') out.push(rule)
  }
  return out
}

function collectBashPromptRuleStrings(
  context: ToolPermissionContext,
  behavior: 'allow' | 'deny' | 'ask',
): string[] {
  const groups =
    behavior === 'allow'
      ? context.alwaysAllowRules
      : behavior === 'deny'
        ? context.alwaysDenyRules
        : context.alwaysAskRules
  const out: string[] = []
  for (const rules of Object.values(groups)) {
    if (!Array.isArray(rules)) continue
    for (const rule of rules) if (typeof rule === 'string') out.push(rule)
  }
  return out
}

function findMatchingBashRules(args: {
  command: string
  toolPermissionContext: ToolPermissionContext
  behavior: 'allow' | 'deny' | 'ask'
  matchType: BashRuleMatchType
}): string[] {
  const trimmed = args.command.trim()
  const withoutRedirectionsRaw =
    stripOutputRedirections(trimmed).commandWithoutRedirections
  const normalizedTrimmed = normalizeBashCommandForRuleMatch(trimmed)
  const normalizedWithoutRedirections = normalizeBashCommandForRuleMatch(
    withoutRedirectionsRaw,
  )
  const candidates =
    args.matchType === 'exact'
      ? [normalizedTrimmed, normalizedWithoutRedirections]
      : [normalizedWithoutRedirections]

  const rules = collectBashRuleStrings(
    args.toolPermissionContext,
    args.behavior,
  )
  const matches: string[] = []

  for (const ruleString of rules) {
    const parsed = parseToolRuleString(ruleString)
    if (!parsed || parsed.toolName !== 'Bash' || !parsed.ruleContent) continue
    const ruleContent = parseBashRuleContent(parsed.ruleContent)
    const wildcardRe =
      ruleContent.type === 'wildcard'
        ? wildcardPatternToRegExp(ruleContent.pattern)
        : null

    const matched = candidates.some(candidate => {
      switch (ruleContent.type) {
        case 'exact':
          return (
            normalizeBashCommandForRuleMatch(ruleContent.command) === candidate
          )
        case 'prefix':
          if (args.matchType === 'exact')
            return (
              normalizeBashCommandForRuleMatch(ruleContent.prefix) === candidate
            )
          if (
            candidate === normalizeBashCommandForRuleMatch(ruleContent.prefix)
          )
            return true
          return candidate.startsWith(
            `${normalizeBashCommandForRuleMatch(ruleContent.prefix)} `,
          )
        case 'wildcard':
          return wildcardRe ? wildcardRe.test(candidate) : false
      }
    })

    if (matched) matches.push(ruleString)
  }

  return matches
}

function findMatchingBashPromptRules(args: {
  prompt: string
  toolPermissionContext: ToolPermissionContext
  behavior: 'allow' | 'deny' | 'ask'
  matchType: PromptRuleMatchType
}): string[] {
  const normalizedPrompt = normalizePromptForRuleMatch(args.prompt)
  if (!normalizedPrompt) return []

  const rules = collectBashPromptRuleStrings(
    args.toolPermissionContext,
    args.behavior,
  )
  const matches: string[] = []

  for (const ruleString of rules) {
    const parsed = parseToolRuleString(ruleString)
    if (!parsed || parsed.toolName !== 'BashPrompt' || !parsed.ruleContent) {
      continue
    }
    const ruleContent = parsePromptRuleContent(parsed.ruleContent)
    const wildcardRe =
      ruleContent.type === 'wildcard'
        ? wildcardPromptPatternToRegExp(ruleContent.pattern)
        : null

    const matched = (() => {
      switch (ruleContent.type) {
        case 'exact':
          return ruleContent.text === normalizedPrompt
        case 'prefix':
          if (args.matchType === 'exact')
            return ruleContent.prefix === normalizedPrompt
          if (normalizedPrompt === ruleContent.prefix) return true
          return normalizedPrompt.startsWith(`${ruleContent.prefix} `)
        case 'wildcard':
          return wildcardRe ? wildcardRe.test(normalizedPrompt) : false
      }
    })()

    if (matched) matches.push(ruleString)
  }

  return matches
}

export function buildBashRuleSuggestionExact(
  command: string,
): ToolPermissionContextUpdate[] {
  return [
    {
      type: 'addRules',
      destination: 'localSettings',
      behavior: 'allow',
      rules: [`Bash(${command})`],
    },
  ]
}

export function buildBashRuleSuggestionPrefix(
  prefix: string,
): ToolPermissionContextUpdate[] {
  return [
    {
      type: 'addRules',
      destination: 'localSettings',
      behavior: 'allow',
      rules: [`Bash(${prefix}:*)`],
    },
  ]
}

export function checkExactBashRules(
  command: string,
  toolPermissionContext: ToolPermissionContext,
): BashPermissionDecision {
  const trimmed = command.trim()
  const denyRules = findMatchingBashRules({
    command: trimmed,
    toolPermissionContext,
    behavior: 'deny',
    matchType: 'exact',
  })
  if (denyRules[0]) {
    return {
      behavior: 'deny',
      message: `Permission to use Bash with command ${trimmed} has been denied.`,
      decisionReason: { type: 'rule', rule: denyRules[0] },
    }
  }

  const askRules = findMatchingBashRules({
    command: trimmed,
    toolPermissionContext,
    behavior: 'ask',
    matchType: 'exact',
  })
  if (askRules[0]) {
    return {
      behavior: 'ask',
      message: `${PRODUCT_NAME} requested permissions to use Bash, but you haven't granted it yet.`,
      decisionReason: { type: 'rule', rule: askRules[0] },
    }
  }

  const allowRules = findMatchingBashRules({
    command: trimmed,
    toolPermissionContext,
    behavior: 'allow',
    matchType: 'exact',
  })
  if (allowRules[0]) {
    return {
      behavior: 'allow',
      updatedInput: { command: trimmed },
      decisionReason: { type: 'rule', rule: allowRules[0] },
    }
  }

  return {
    behavior: 'passthrough',
    message: `${PRODUCT_NAME} requested permissions to use Bash, but you haven't granted it yet.`,
    decisionReason: { type: 'other', reason: 'This command requires approval' },
    suggestions: buildBashRuleSuggestionExact(trimmed),
  }
}

export function checkPrefixBashRules(
  command: string,
  toolPermissionContext: ToolPermissionContext,
): { deny?: string; ask?: string; allow?: string } {
  const deny = findMatchingBashRules({
    command,
    toolPermissionContext,
    behavior: 'deny',
    matchType: 'prefix',
  })[0]
  const ask = findMatchingBashRules({
    command,
    toolPermissionContext,
    behavior: 'ask',
    matchType: 'prefix',
  })[0]
  const allow = findMatchingBashRules({
    command,
    toolPermissionContext,
    behavior: 'allow',
    matchType: 'prefix',
  })[0]
  return { deny, ask, allow }
}

export function formatBashPromptRule(prompt: string): string {
  return `BashPrompt(${normalizePromptForRuleMatch(prompt)})`
}

export function checkPromptBashRules(
  prompt: string,
  toolPermissionContext: ToolPermissionContext,
): { deny?: string; ask?: string; allow?: string } {
  const normalized = normalizePromptForRuleMatch(prompt)
  if (!normalized) return {}

  const deny = findMatchingBashPromptRules({
    prompt: normalized,
    toolPermissionContext,
    behavior: 'deny',
    matchType: 'prefix',
  })[0]
  const ask = findMatchingBashPromptRules({
    prompt: normalized,
    toolPermissionContext,
    behavior: 'ask',
    matchType: 'prefix',
  })[0]
  const allow = findMatchingBashPromptRules({
    prompt: normalized,
    toolPermissionContext,
    behavior: 'allow',
    matchType: 'prefix',
  })[0]
  return { deny, ask, allow }
}

const ACCEPT_EDITS_AUTO_ALLOW_BASE_COMMANDS = new Set([
  'mkdir',
  'touch',
  'rm',
  'rmdir',
  'mv',
  'cp',
  'sed',
])

export function modeSpecificBashDecision(
  command: string,
  toolPermissionContext: ToolPermissionContext,
): BashPermissionDecision {
  if (toolPermissionContext.mode !== 'acceptEdits') {
    return {
      behavior: 'passthrough',
      message: 'No mode-specific validation required',
    }
  }
  const base = command.trim().split(/\s+/)[0] ?? ''
  if (!base)
    return { behavior: 'passthrough', message: 'Base command not found' }
  if (ACCEPT_EDITS_AUTO_ALLOW_BASE_COMMANDS.has(base)) {
    return {
      behavior: 'allow',
      updatedInput: { command },
      decisionReason: {
        type: 'other',
        reason: 'Auto-allowed in acceptEdits mode',
      },
    }
  }
  return {
    behavior: 'passthrough',
    message: `No mode-specific handling for '${base}' in ${toolPermissionContext.mode} mode`,
  }
}
