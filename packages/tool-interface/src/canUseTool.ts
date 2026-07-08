import type { Tool, ToolUseContext } from './Tool'
import type { ToolPermissionContextUpdate } from './permissions'

export type CanUseToolFn<
  TAssistantMessage = unknown,
  TToolUseContext extends ToolUseContext = ToolUseContext,
> = (
  tool: Tool,
  input: { [key: string]: unknown },
  toolUseContext: TToolUseContext,
  assistantMessage: TAssistantMessage,
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
