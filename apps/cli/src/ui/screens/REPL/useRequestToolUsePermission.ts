import { useCallback } from 'react'
import type { Tool, ToolUseContext } from '#core/tooling/Tool'
import type { CommandSubcommandPrefixResult } from '#core/utils/commands'
import type { ToolPermissionContextUpdate } from '#core/types/toolPermissionContext'
import { createAssistantMessage } from '#core/utils/messages'
import type { ToolUseConfirm } from '#ui-ink/components/permissions/PermissionRequest'

type PermissionDecision =
  | { result: true; type: 'permanent' | 'temporary' }
  | { result: false; rejectionMessage?: string }

export function useRequestToolUsePermission(args: {
  setToolUseConfirm: (confirm: ToolUseConfirm | null) => void
}) {
  return useCallback(
    async (
      request: {
        tool: Tool
        description: string
        input: { [key: string]: unknown }
        commandPrefix: CommandSubcommandPrefixResult | null
        suggestions?: ToolPermissionContextUpdate[]
        riskScore: number | null
      },
      toolUseContext: ToolUseContext,
    ): Promise<PermissionDecision> => {
      return await new Promise<PermissionDecision>(resolve => {
        if (toolUseContext.abortController.signal.aborted) {
          resolve({ result: false })
          return
        }

        const assistantMessage = createAssistantMessage('')
        if (toolUseContext.messageId) {
          assistantMessage.message.id = toolUseContext.messageId
        }

        const toolUseConfirm: ToolUseConfirm = {
          assistantMessage,
          tool: request.tool,
          description: request.description,
          input: request.input,
          commandPrefix: request.commandPrefix ?? null,
          toolUseContext,
          suggestions: request.suggestions,
          riskScore: request.riskScore ?? null,
          onAbort() {
            resolve({ result: false })
            toolUseContext.abortController.abort()
          },
          onAllow(type) {
            resolve({ result: true, type })
          },
          onReject(rejectionMessage) {
            resolve({ result: false, rejectionMessage })
          },
        }

        args.setToolUseConfirm(toolUseConfirm)
      })
    },
    [args],
  )
}
