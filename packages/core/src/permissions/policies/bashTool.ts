import { getBunShellSandboxPlan } from '#core/utils/sandbox/bunShellSandboxPlan'
import type { Tool, ToolUseContext } from '#core/tooling/Tool'
import type { ToolPermissionContext } from '#core/types/toolPermissionContext'
import {
  checkBashPermissions,
  checkBashPermissionsAutoAllowedBySandbox,
} from '#core/utils/permissions/bashToolPermissionEngine'

import type { PermissionResult } from '../types'
import { SAFE_COMMANDS } from './bash'
import { getBooleanFromInput, getStringFromInput } from './input'

export async function checkBashToolPermission(args: {
  tool: Tool
  input: Record<string, unknown>
  context: ToolUseContext
  effectiveToolPermissionContext: ToolPermissionContext
}): Promise<PermissionResult> {
  const command = getStringFromInput(args.input, 'command').trim()
  const description = getStringFromInput(args.input, 'description').trim()
  const dangerouslyDisableSandbox = getBooleanFromInput(
    args.input,
    'dangerouslyDisableSandbox',
  )
  const safeMode = Boolean(
    args.context.options?.safeMode ?? args.context.safeMode,
  )

  if (SAFE_COMMANDS.has(command)) return { result: true }

  const sandboxPlan = getBunShellSandboxPlan({
    command,
    dangerouslyDisableSandbox,
    toolUseContext: args.context,
  })

  if (sandboxPlan.shouldBlockUnsandboxedCommand) {
    return {
      result: false,
      message:
        'This command must run in the sandbox, but sandboxed execution is not available.',
      shouldPromptUser: false,
    }
  }

  if (sandboxPlan.shouldAutoAllowBashPermissions && !safeMode) {
    return checkBashPermissionsAutoAllowedBySandbox({
      command,
      toolPermissionContext: args.effectiveToolPermissionContext,
    })
  }

  return await checkBashPermissions({
    command,
    description: description.length > 0 ? description : undefined,
    toolPermissionContext: args.effectiveToolPermissionContext,
    toolUseContext: args.context,
  })
}
