import type { ToolUseContext } from '#core/tooling/Tool'
import type { AssistantMessage } from '#core/query'
import type { CanUseToolFn as InterfaceCanUseToolFn } from '@kode/tool-interface/canUseTool'

export type CanUseToolFn = InterfaceCanUseToolFn<
  AssistantMessage,
  ToolUseContext
>
