import type { ToolUseContext } from '#core/tooling/Tool'
import type { ToolPermissionContext } from '#core/types/toolPermissionContext'
import { getCwd } from '#core/utils/state'
import { PRODUCT_NAME } from '#core/constants/product'
import type {
  BashPermissionDecision,
  BashPermissionResult,
  DecisionReason,
} from './types'
import {
  isUnsafeCompoundCommand,
  splitBashCommandIntoSubcommands,
} from './shellTokens'
import { validateBashCommandPaths } from './paths'
import { checkSedCommandSafety } from './sed'
import {
  buildBashRuleSuggestionExact,
  checkExactBashRules,
  checkPrefixBashRules,
  modeSpecificBashDecision,
} from './rules'
import { xi } from './xi'
import { checkBashCommandSyntax } from './validators'

function parseBoolLikeEnv(value: string | undefined): boolean {
  if (!value) return false
  const v = value.trim().toLowerCase()
  return ['1', 'true', 'yes', 'y', 'on', 'enable', 'enabled'].includes(v)
}

function h02(args: {
  command: string
  cwd: string
  toolPermissionContext: ToolPermissionContext
  hasCdInCompound: boolean
}): BashPermissionDecision {
  const trimmed = args.command.trim()

  const exact = checkExactBashRules(trimmed, args.toolPermissionContext)
  if (exact.behavior === 'deny' || exact.behavior === 'ask') return exact

  const prefixMatches = checkPrefixBashRules(
    trimmed,
    args.toolPermissionContext,
  )
  if (prefixMatches.deny) {
    return {
      behavior: 'deny',
      message: `Permission to use Bash with command ${trimmed} has been denied.`,
      decisionReason: { type: 'rule', rule: prefixMatches.deny },
    }
  }
  if (prefixMatches.ask) {
    return {
      behavior: 'ask',
      message: `${PRODUCT_NAME} requested permissions to use Bash, but you haven't granted it yet.`,
      decisionReason: { type: 'rule', rule: prefixMatches.ask },
    }
  }

  const pathDecision = validateBashCommandPaths({
    command: trimmed,
    cwd: args.cwd,
    toolPermissionContext: args.toolPermissionContext,
    hasCdInCompound: args.hasCdInCompound,
  })
  if (pathDecision.behavior !== 'passthrough') return pathDecision

  if (exact.behavior === 'allow') return exact

  if (prefixMatches.allow) {
    return {
      behavior: 'allow',
      updatedInput: { command: trimmed },
      decisionReason: { type: 'rule', rule: prefixMatches.allow },
    }
  }

  const sedDecision = checkSedCommandSafety({
    command: trimmed,
    toolPermissionContext: args.toolPermissionContext,
  })
  if (sedDecision.behavior !== 'passthrough') return sedDecision

  const modeDecision = modeSpecificBashDecision(
    trimmed,
    args.toolPermissionContext,
  )
  if (modeDecision.behavior !== 'passthrough') return modeDecision

  if (
    !parseBoolLikeEnv(
      process.env.KODE_DISABLE_COMMAND_INJECTION_CHECK ??
        process.env.CLAUDE_CODE_DISABLE_COMMAND_INJECTION_CHECK,
    )
  ) {
    const security = xi(trimmed)
    if (security.behavior !== 'passthrough') {
      const reason: DecisionReason = {
        type: 'other',
        reason:
          security.message ||
          'This command contains patterns that could pose security risks and requires approval',
      }
      return {
        behavior: 'ask',
        message:
          security.message ||
          `${PRODUCT_NAME} requested permissions to use Bash, but you haven't granted it yet.`,
        decisionReason: reason,
        suggestions: [],
      }
    }
  }

  return {
    behavior: 'passthrough',
    message: `${PRODUCT_NAME} requested permissions to use Bash, but you haven't granted it yet.`,
    decisionReason: { type: 'other', reason: 'This command requires approval' },
    suggestions: buildBashRuleSuggestionExact(trimmed),
  }
}

export async function checkBashPermissions(args: {
  command: string
  toolPermissionContext: ToolPermissionContext
  toolUseContext: ToolUseContext
  getCwdForPaths?: () => string
}): Promise<BashPermissionResult> {
  const cwd = (args.getCwdForPaths ?? getCwd)()
  const trimmed = args.command.trim()

  const syntax = checkBashCommandSyntax(trimmed)
  if (syntax.behavior !== 'passthrough') {
    return {
      result: false,
      message:
        'message' in syntax
          ? syntax.message
          : `${PRODUCT_NAME} requested permissions to use Bash, but you haven't granted it yet.`,
    }
  }

  if (
    !parseBoolLikeEnv(
      process.env.KODE_DISABLE_COMMAND_INJECTION_CHECK ??
        process.env.CLAUDE_CODE_DISABLE_COMMAND_INJECTION_CHECK,
    ) &&
    isUnsafeCompoundCommand(trimmed)
  ) {
    const security = xi(trimmed)
    return {
      result: false,
      message:
        security.behavior === 'ask' && security.message
          ? security.message
          : `${PRODUCT_NAME} requested permissions to use Bash, but you haven't granted it yet.`,
    }
  }

  const fullExact = checkExactBashRules(trimmed, args.toolPermissionContext)
  if (fullExact.behavior === 'deny') {
    return {
      result: false,
      message: fullExact.message,
      shouldPromptUser: false,
    }
  }

  const subcommands = splitBashCommandIntoSubcommands(trimmed).filter(
    cmd => cmd !== `cd ${cwd}`,
  )
  const cdCommands = subcommands.filter(cmd => cmd.trim().startsWith('cd '))
  if (cdCommands.length > 1) {
    return {
      result: false,
      message: `${PRODUCT_NAME} requested permissions to use Bash, but you haven't granted it yet.`,
    }
  }
  const hasCdInCompound = cdCommands.length > 0

  const subResults = new Map<string, BashPermissionDecision>()
  for (const sub of subcommands) {
    const decision = h02({
      command: sub,
      cwd,
      toolPermissionContext: args.toolPermissionContext,
      hasCdInCompound,
    })
    subResults.set(sub, decision)
  }

  for (const decision of subResults.values()) {
    if (decision.behavior === 'deny') {
      return {
        result: false,
        message: decision.message,
        shouldPromptUser: false,
      }
    }
  }

  const fullPathDecision = validateBashCommandPaths({
    command: trimmed,
    cwd,
    toolPermissionContext: args.toolPermissionContext,
    hasCdInCompound,
  })
  if (fullPathDecision.behavior === 'deny') {
    return {
      result: false,
      message: fullPathDecision.message,
      shouldPromptUser: false,
    }
  }
  if (fullPathDecision.behavior === 'ask') {
    return {
      result: false,
      message: fullPathDecision.message,
      suggestions: fullPathDecision.suggestions,
    }
  }

  for (const decision of subResults.values()) {
    if (decision.behavior === 'ask') {
      return {
        result: false,
        message: decision.message,
        suggestions: decision.suggestions,
      }
    }
  }

  if (fullExact.behavior === 'allow') return { result: true }

  if (Array.from(subResults.values()).every(d => d.behavior === 'allow')) {
    return { result: true }
  }

  return {
    result: false,
    message: `${PRODUCT_NAME} requested permissions to use Bash, but you haven't granted it yet.`,
    suggestions: buildBashRuleSuggestionExact(trimmed),
  }
}

export function checkBashPermissionsAutoAllowedBySandbox(args: {
  command: string
  toolPermissionContext: ToolPermissionContext
}): BashPermissionResult {
  const trimmed = args.command.trim()
  const prefixMatches = checkPrefixBashRules(
    trimmed,
    args.toolPermissionContext,
  )

  if (prefixMatches.deny) {
    return {
      result: false,
      message: `Permission to use Bash with command ${trimmed} has been denied.`,
      shouldPromptUser: false,
    }
  }

  if (prefixMatches.ask) {
    return {
      result: false,
      message: `${PRODUCT_NAME} requested permissions to use Bash, but you haven't granted it yet.`,
    }
  }

  return { result: true }
}
