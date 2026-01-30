import type { ToolUseContext, Tool as ToolType } from '#core/tooling/Tool'
import type { AssistantMessage } from '#core/query'
import type { ToolPermissionContextUpdate } from '#core/types/toolPermissionContext'

export type CanUseToolFn = (
  tool: ToolType,
  input: { [key: string]: unknown },
  toolUseContext: ToolUseContext,
  assistantMessage: AssistantMessage,
) => Promise<
  | { result: true; updatedInput?: { [key: string]: unknown } }
  | {
      result: false
      message: string
      shouldPromptUser?: boolean
      suggestions?: ToolPermissionContextUpdate[]
      blockedPath?: string
      decisionReason?: string
      riskScore?: number | null
    }
>
