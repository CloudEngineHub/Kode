import type { Tool, ToolUseContext } from '#core/tooling/Tool'
import type { ToolPermissionContext } from '#core/types/toolPermissionContext'

import type { PermissionResult } from '../types'
import type { Message } from '@kode/core/query'

import { checkBashToolPermission } from './bashTool'
import { checkDefaultToolPermission } from './defaultTool'
import { checkFilesystemPermission } from './filesystem'
import { checkSkillPermission } from './skill'
import { checkSlashCommandPermission } from './slashCommand'
import { checkWebPermission } from './web'

export async function checkToolPermissionByName(args: {
  tool: Tool
  input: Record<string, unknown>
  context: ToolUseContext
  assistantMessage: Message | undefined
  effectiveAllowedTools: string[]
  effectiveDeniedTools: string[]
  effectiveAskedTools: string[]
  effectiveToolPermissionContext: ToolPermissionContext
  checkEditPermissionForPath: (toolPath: string) => PermissionResult
}): Promise<PermissionResult> {
  switch (args.tool.name) {
    case 'Bash':
      return await checkBashToolPermission(args)
    case 'SlashCommand':
      return checkSlashCommandPermission(args)
    case 'Skill':
      return checkSkillPermission(args)
    case 'Read':
    case 'LS':
    case 'Glob':
    case 'Grep':
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
      return checkFilesystemPermission(args)
    case 'WebFetch':
    case 'WebSearch':
      return checkWebPermission(args)
    default:
      return checkDefaultToolPermission(args)
  }
}
