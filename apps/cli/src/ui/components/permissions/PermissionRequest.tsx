import * as React from 'react'
import { Tool } from '#core/tooling/Tool'
import { AssistantMessage } from '#core/query'
import type { ToolUseContext } from '#core/tooling/Tool'
import { FileEditTool } from '#tools/tools/filesystem/FileEditTool/FileEditTool'
import { FileWriteTool } from '#tools/tools/filesystem/FileWriteTool/FileWriteTool'
import { BashTool } from '#tools/tools/system/BashTool/BashTool'
import { FileEditPermissionRequest } from './FileEditPermissionRequest/FileEditPermissionRequest'
import { BashPermissionRequest } from './BashPermissionRequest/BashPermissionRequest'
import { FallbackPermissionRequest } from './FallbackPermissionRequest'
import { useNotifyAfterTimeout } from '#ui-ink/hooks/useNotifyAfterTimeout'
import { FileWritePermissionRequest } from './FileWritePermissionRequest/FileWritePermissionRequest'
import { type CommandSubcommandPrefixResult } from '#core/utils/commands'
import { FilesystemPermissionRequest } from './FilesystemPermissionRequest/FilesystemPermissionRequest'
import { NotebookEditTool } from '#tools/tools/filesystem/NotebookEditTool/NotebookEditTool'
import { GlobTool } from '#tools/tools/filesystem/GlobTool/GlobTool'
import { GrepTool } from '#tools/tools/search/GrepTool/GrepTool'
import { FileReadTool } from '#tools/tools/filesystem/FileReadTool/FileReadTool'
import { PRODUCT_NAME } from '#core/constants/product'
import { SlashCommandTool } from '#tools/tools/interaction/SlashCommandTool/SlashCommandTool'
import { SkillTool } from '#tools/tools/interaction/SkillTool/SkillTool'
import { SlashCommandPermissionRequest } from './SlashCommandPermissionRequest/SlashCommandPermissionRequest'
import { SkillPermissionRequest } from './SkillPermissionRequest/SkillPermissionRequest'
import { WebFetchTool } from '#tools/tools/network/WebFetchTool/WebFetchTool'
import { WebFetchPermissionRequest } from './WebFetchPermissionRequest/WebFetchPermissionRequest'
import { ExitPlanModeTool } from '#tools/tools/interaction/PlanModeTool/ExitPlanModeTool'
import { ExitPlanModePermissionRequest } from './PlanModePermissionRequest/ExitPlanModePermissionRequest'
import { AskUserQuestionTool } from '#tools/tools/interaction/AskUserQuestionTool/AskUserQuestionTool'
import { AskUserQuestionPermissionRequest } from './AskUserQuestionPermissionRequest/AskUserQuestionPermissionRequest'
import type { ToolPermissionContextUpdate } from '#core/types/toolPermissionContext'
import { useKeypress } from '#ui-ink/hooks/useKeypress'

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
  const prefix = toolUseConfirm.commandPrefix
  if (!prefix) return null
  if (prefix.commandInjectionDetected) return null
  if (!('commandPrefix' in prefix)) return null
  return prefix.commandPrefix ?? null
}

export type ToolUseConfirm = {
  assistantMessage: AssistantMessage
  tool: Tool
  description: string
  input: { [key: string]: unknown }
  commandPrefix: CommandSubcommandPrefixResult | null
  toolUseContext: ToolUseContext
  suggestions?: ToolPermissionContextUpdate[]
  blockedPath?: string
  decisionReason?: string
  // NOTE: riskScore is carried through to support current permission UX.
  riskScore: number | null
  onAbort(): void
  onAllow(
    type: 'permanent' | 'temporary',
    options?: { updatedInput?: { [key: string]: unknown } },
  ): void
  onReject(rejectionMessage?: string): void
}

// NOTE: Permission rendering is centralized to keep UX consistent across tools/hosts.
export function PermissionRequest({
  toolUseConfirm,
  onDone,
  verbose,
}: PermissionRequestProps): React.ReactNode {
  // Handle Ctrl+C and Esc (reject).
  useKeypress(
    (input, key) => {
      if (key.ctrl && input === 'c') {
        onDone()
        toolUseConfirm.onReject()
        return true
      }

      if (key.escape) {
        onDone()
        toolUseConfirm.onReject()
        return true
      }
    },
    // Let tool-specific permission UIs intercept Esc first (e.g. WebFetch logging).
    { priority: -10 },
  )

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
