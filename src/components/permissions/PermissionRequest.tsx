import { useInput } from 'ink'
import * as React from 'react'
import { Tool } from '@tool'
import { AssistantMessage } from '@query'
import type { ToolUseContext } from '@tool'
import { FileEditTool } from '@tools/FileEditTool/FileEditTool'
import { FileWriteTool } from '@tools/FileWriteTool/FileWriteTool'
import { BashTool } from '@tools/BashTool/BashTool'
import { FileEditPermissionRequest } from './FileEditPermissionRequest/FileEditPermissionRequest'
import { BashPermissionRequest } from './BashPermissionRequest/BashPermissionRequest'
import { FallbackPermissionRequest } from './FallbackPermissionRequest'
import { useNotifyAfterTimeout } from '@hooks/useNotifyAfterTimeout'
import { FileWritePermissionRequest } from './FileWritePermissionRequest/FileWritePermissionRequest'
import { type CommandSubcommandPrefixResult } from '@utils/commands'
import { FilesystemPermissionRequest } from './FilesystemPermissionRequest/FilesystemPermissionRequest'
import { NotebookEditTool } from '@tools/NotebookEditTool/NotebookEditTool'
import { GlobTool } from '@tools/GlobTool/GlobTool'
import { GrepTool } from '@tools/GrepTool/GrepTool'
import { FileReadTool } from '@tools/FileReadTool/FileReadTool'
import { PRODUCT_NAME } from '@constants/product'
import { SlashCommandTool } from '@tools/SlashCommandTool/SlashCommandTool'
import { SkillTool } from '@tools/SkillTool/SkillTool'
import { SlashCommandPermissionRequest } from './SlashCommandPermissionRequest/SlashCommandPermissionRequest'
import { SkillPermissionRequest } from './SkillPermissionRequest/SkillPermissionRequest'
import { WebFetchTool } from '@tools/WebFetchTool/WebFetchTool'
import { WebFetchPermissionRequest } from './WebFetchPermissionRequest/WebFetchPermissionRequest'
import { EnterPlanModeTool } from '@tools/PlanModeTool/EnterPlanModeTool'
import { ExitPlanModeTool } from '@tools/PlanModeTool/ExitPlanModeTool'
import { EnterPlanModePermissionRequest } from './PlanModePermissionRequest/EnterPlanModePermissionRequest'
import { ExitPlanModePermissionRequest } from './PlanModePermissionRequest/ExitPlanModePermissionRequest'
import { AskUserQuestionTool } from '@tools/AskUserQuestionTool/AskUserQuestionTool'
import { AskUserQuestionPermissionRequest } from './AskUserQuestionPermissionRequest/AskUserQuestionPermissionRequest'
import type { ToolPermissionContextUpdate } from '@kode-types/toolPermissionContext'

function permissionComponentForTool(tool: Tool) {
  switch (tool) {
    case FileEditTool:
      return FileEditPermissionRequest
    case FileWriteTool:
      return FileWritePermissionRequest
    case BashTool:
      return BashPermissionRequest
    case GlobTool:
    case GrepTool:
    case FileReadTool:
    case NotebookEditTool:
      return FilesystemPermissionRequest
    case SlashCommandTool:
      return SlashCommandPermissionRequest
    case SkillTool:
      return SkillPermissionRequest
    case WebFetchTool:
      return WebFetchPermissionRequest
    case EnterPlanModeTool:
      return EnterPlanModePermissionRequest
    case ExitPlanModeTool:
      return ExitPlanModePermissionRequest
    case AskUserQuestionTool:
      return AskUserQuestionPermissionRequest
    default:
      return FallbackPermissionRequest
  }
}

export type PermissionRequestProps = {
  toolUseConfirm: ToolUseConfirm
  onDone(): void
  verbose: boolean
}

export function toolUseConfirmGetPrefix(
  toolUseConfirm: ToolUseConfirm,
): string | null {
  return (
    (toolUseConfirm.commandPrefix &&
      !(toolUseConfirm.commandPrefix as any).commandInjectionDetected &&
      (toolUseConfirm.commandPrefix as any).commandPrefix) ||
    null
  )
}

export type ToolUseConfirm = {
  assistantMessage: AssistantMessage
  tool: Tool
  description: string
  input: { [key: string]: unknown }
  commandPrefix: CommandSubcommandPrefixResult | null
  toolUseContext: ToolUseContext
  suggestions?: ToolPermissionContextUpdate[]
  // TODO: remove riskScore from ToolUseConfirm
  riskScore: number | null
  onAbort(): void
  onAllow(type: 'permanent' | 'temporary'): void
  onReject(rejectionMessage?: string): void
}

// TODO: Move this to Tool.renderPermissionRequest
export function PermissionRequest({
  toolUseConfirm,
  onDone,
  verbose,
}: PermissionRequestProps): React.ReactNode {
  // Handle Ctrl+C
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      onDone()
      toolUseConfirm.onReject()
    }
  })

  const toolName =
    toolUseConfirm.tool.userFacingName?.() || toolUseConfirm.tool.name || 'Tool'
  useNotifyAfterTimeout(
    `${PRODUCT_NAME} needs your permission to use ${toolName}`,
  )

  const PermissionComponent = permissionComponentForTool(toolUseConfirm.tool)

  return (
    <PermissionComponent
      toolUseConfirm={toolUseConfirm}
      onDone={onDone}
      verbose={verbose}
    />
  )
}
