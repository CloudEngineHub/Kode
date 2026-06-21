import type { Tool, ToolUseContext } from '#core/tooling/Tool'
import {
  getCommandSubcommandPrefix,
  splitCommand,
  type CommandPrefixResult,
} from '#core/utils/commands'
import { AbortError } from '#core/utils/errors'
import { getCwd } from '#core/utils/state'
import { PRODUCT_NAME } from '#core/constants/product'

import { getPermissionKey } from '../permissionKey'
import type { PermissionResult } from '../types'

// Commands that are known to be safe for execution.
export const SAFE_COMMANDS = new Set([
  'git status',
  'git diff',
  'git log',
  'git branch',
  'pwd',
  'tree',
  'date',
  'which',
])

function getSafeCommandPrefix(
  result: CommandPrefixResult | null | undefined,
): string | null {
  if (!result) return null
  if (!('commandPrefix' in result)) return null
  return result.commandPrefix
}

export const bashToolCommandHasExactMatchPermission = (
  tool: Tool,
  command: string,
  allowedTools: string[],
): boolean => {
  if (SAFE_COMMANDS.has(command)) {
    return true
  }
  if (allowedTools.includes(getPermissionKey(tool, { command }, null))) {
    return true
  }
  if (allowedTools.includes(getPermissionKey(tool, { command }, command))) {
    return true
  }
  return false
}

const bashToolCommandHasExplicitRule = (
  tool: Tool,
  command: string,
  prefix: string | null,
  rules: string[],
): boolean => {
  if (rules.includes(getPermissionKey(tool, { command }, null))) {
    return true
  }
  if (rules.includes(getPermissionKey(tool, { command }, command))) {
    return true
  }
  if (prefix && rules.includes(getPermissionKey(tool, { command }, prefix))) {
    return true
  }
  return false
}

export const bashToolCommandHasPermission = (
  tool: Tool,
  command: string,
  prefix: string | null,
  allowedTools: string[],
): boolean => {
  if (bashToolCommandHasExactMatchPermission(tool, command, allowedTools)) {
    return true
  }
  return allowedTools.includes(getPermissionKey(tool, { command }, prefix))
}

export const bashToolHasPermission = async (
  tool: Tool,
  command: string,
  context: ToolUseContext,
  allowedTools: string[],
  deniedTools: string[] = [],
  askedTools: string[] = [],
  getCommandSubcommandPrefixFn = getCommandSubcommandPrefix,
): Promise<PermissionResult> => {
  const trimmedCommand = command.trim()
  const exactKey = getPermissionKey(tool, { command: trimmedCommand }, null)
  if (deniedTools.includes(exactKey)) {
    return {
      result: false,
      message: `Permission to use ${tool.name} with command ${trimmedCommand} has been denied.`,
      shouldPromptUser: false,
    }
  }
  if (askedTools.includes(exactKey)) {
    return {
      result: false,
      message: `${PRODUCT_NAME} requested permissions to use ${tool.name}, but you haven't granted it yet.`,
    }
  }

  if (
    bashToolCommandHasExactMatchPermission(tool, trimmedCommand, allowedTools)
  ) {
    return { result: true }
  }

  const subCommands = splitCommand(trimmedCommand).filter(_ => {
    if (_ === `cd ${getCwd()}`) {
      return false
    }
    return true
  })
  const commandSubcommandPrefix = await getCommandSubcommandPrefixFn(
    trimmedCommand,
    context.abortController.signal,
  )
  if (context.abortController.signal.aborted) {
    throw new AbortError()
  }

  if (commandSubcommandPrefix === null) {
    return {
      result: false,
      message: `${PRODUCT_NAME} requested permissions to use ${tool.name}, but you haven't granted it yet.`,
    }
  }

  if (commandSubcommandPrefix.commandInjectionDetected) {
    if (
      bashToolCommandHasExplicitRule(tool, trimmedCommand, null, deniedTools)
    ) {
      return {
        result: false,
        message: `Permission to use ${tool.name} with command ${trimmedCommand} has been denied.`,
        shouldPromptUser: false,
      }
    }
    if (
      bashToolCommandHasExplicitRule(tool, trimmedCommand, null, askedTools)
    ) {
      return {
        result: false,
        message: `${PRODUCT_NAME} requested permissions to use ${tool.name}, but you haven't granted it yet.`,
      }
    }
    if (
      bashToolCommandHasExactMatchPermission(tool, trimmedCommand, allowedTools)
    ) {
      return { result: true }
    }
    return {
      result: false,
      message: `${PRODUCT_NAME} requested permissions to use ${tool.name}, but you haven't granted it yet.`,
    }
  }

  const fullCommandPrefix = getSafeCommandPrefix(commandSubcommandPrefix)

  if (subCommands.length < 2) {
    if (
      bashToolCommandHasExplicitRule(
        tool,
        trimmedCommand,
        fullCommandPrefix,
        deniedTools,
      )
    ) {
      return {
        result: false,
        message: `Permission to use ${tool.name} with command ${trimmedCommand} has been denied.`,
        shouldPromptUser: false,
      }
    }
    if (
      bashToolCommandHasExplicitRule(
        tool,
        trimmedCommand,
        fullCommandPrefix,
        askedTools,
      )
    ) {
      return {
        result: false,
        message: `${PRODUCT_NAME} requested permissions to use ${tool.name}, but you haven't granted it yet.`,
      }
    }
    if (
      bashToolCommandHasPermission(
        tool,
        trimmedCommand,
        fullCommandPrefix,
        allowedTools,
      )
    ) {
      return { result: true }
    }
    return {
      result: false,
      message: `${PRODUCT_NAME} requested permissions to use ${tool.name}, but you haven't granted it yet.`,
    }
  }

  if (
    subCommands.every(subCommand => {
      const prefixResult =
        commandSubcommandPrefix.subcommandPrefixes.get(subCommand)
      if (prefixResult === undefined || prefixResult.commandInjectionDetected) {
        return false
      }
      if (
        bashToolCommandHasExplicitRule(
          tool,
          subCommand,
          getSafeCommandPrefix(prefixResult),
          deniedTools,
        )
      ) {
        return false
      }
      if (
        bashToolCommandHasExplicitRule(
          tool,
          subCommand,
          getSafeCommandPrefix(prefixResult),
          askedTools,
        )
      ) {
        return false
      }
      return bashToolCommandHasPermission(
        tool,
        subCommand,
        getSafeCommandPrefix(prefixResult),
        allowedTools,
      )
    })
  ) {
    return { result: true }
  }

  const deniedSubcommand = subCommands.find(subCommand => {
    const prefixResult =
      commandSubcommandPrefix.subcommandPrefixes.get(subCommand)
    if (!prefixResult || prefixResult.commandInjectionDetected) return false
    return bashToolCommandHasExplicitRule(
      tool,
      subCommand,
      getSafeCommandPrefix(prefixResult),
      deniedTools,
    )
  })
  if (deniedSubcommand) {
    return {
      result: false,
      message: `Permission to use ${tool.name} with command ${deniedSubcommand.trim()} has been denied.`,
      shouldPromptUser: false,
    }
  }

  const askedSubcommand = subCommands.find(subCommand => {
    const prefixResult =
      commandSubcommandPrefix.subcommandPrefixes.get(subCommand)
    if (!prefixResult || prefixResult.commandInjectionDetected) return false
    return bashToolCommandHasExplicitRule(
      tool,
      subCommand,
      getSafeCommandPrefix(prefixResult),
      askedTools,
    )
  })
  if (askedSubcommand) {
    return {
      result: false,
      message: `${PRODUCT_NAME} requested permissions to use ${tool.name}, but you haven't granted it yet.`,
    }
  }

  return {
    result: false,
    message: `${PRODUCT_NAME} requested permissions to use ${tool.name}, but you haven't granted it yet.`,
  }
}
