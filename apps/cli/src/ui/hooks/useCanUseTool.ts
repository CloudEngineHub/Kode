import React, { useCallback } from 'react'
import { hasPermissionsToUseTool } from '#core/permissions'
import type { CanUseToolFn } from '#core/permissions/canUseTool'
import { BashTool, inputSchema } from '#tools/tools/system/BashTool/BashTool'
import { getCommandSubcommandPrefix } from '#core/utils/commands'
import {
  REJECT_MESSAGE,
  REJECT_MESSAGE_WITH_FEEDBACK_PREFIX,
} from '#core/utils/messages'
import { ToolUseConfirm } from '#ui-ink/components/permissions/PermissionRequest'
import { AbortError } from '#core/utils/errors'
import { logError } from '#core/utils/log'
import type { UnreachablePermissionRuleWarning } from '#core/permissions'
import { findUnreachablePermissionRules } from '#core/permissions'
import { resolveToolDescription } from '#core/tooling/Tool'

type SetState<T> = React.Dispatch<React.SetStateAction<T>>

function useCanUseTool(
  setToolUseConfirm: SetState<ToolUseConfirm | null>,
  options?: {
    onPermissionRuleWarnings?: (
      warnings: UnreachablePermissionRuleWarning[],
    ) => void
  },
): CanUseToolFn {
  return useCallback<CanUseToolFn>(
    async (tool, input, toolUseContext, assistantMessage) => {
      return new Promise(resolve => {
        function logCancelledEvent() {}

        function resolveWithCancelledAndAbortAllToolCalls(message?: string) {
          resolve({
            result: false,
            message: message
              ? `${REJECT_MESSAGE_WITH_FEEDBACK_PREFIX}${message}`
              : REJECT_MESSAGE,
          })
          // Trigger a synthetic assistant message in query(), to cancel
          // any other pending tool uses and stop further requests to the
          // API and wait for user input.
          toolUseContext.abortController.abort()
        }

        if (toolUseContext.abortController.signal.aborted) {
          logCancelledEvent()
          resolveWithCancelledAndAbortAllToolCalls()
          return
        }

        return hasPermissionsToUseTool(
          tool,
          input,
          toolUseContext,
          assistantMessage,
        )
          .then(async result => {
            // Has permissions to use tool, granted in config
            if (result.result === true) {
              resolve({ result: true })
              return
            }

            const deniedResult = result as Extract<
              typeof result,
              { result: false }
            >

            if (deniedResult.shouldPromptUser === false) {
              resolve({ result: false, message: deniedResult.message })
              return
            }

            const [description, commandPrefix] = await Promise.all([
              resolveToolDescription(tool, input as never),
              tool === BashTool
                ? getCommandSubcommandPrefix(
                    inputSchema.parse(input).command, // already validated upstream, so ok to parse (as opposed to safeParse)
                    toolUseContext.abortController.signal,
                  )
                : Promise.resolve(null),
            ])

            if (toolUseContext.abortController.signal.aborted) {
              logCancelledEvent()
              resolveWithCancelledAndAbortAllToolCalls()
              return
            }

            // Does not have permissions to use tool, ask the user
            setToolUseConfirm({
              assistantMessage,
              tool,
              description,
              input,
              commandPrefix,
              toolUseContext,
              suggestions: deniedResult.suggestions,
              blockedPath:
                typeof deniedResult.blockedPath === 'string'
                  ? deniedResult.blockedPath
                  : undefined,
              decisionReason:
                typeof deniedResult.decisionReason === 'string'
                  ? deniedResult.decisionReason
                  : undefined,
              riskScore:
                typeof deniedResult.riskScore === 'number'
                  ? deniedResult.riskScore
                  : null,
              onAbort() {
                logCancelledEvent()
                resolveWithCancelledAndAbortAllToolCalls()
              },
              onAllow(type, allowOptions) {
                if (type === 'permanent') {
                  const ctx = toolUseContext.options?.toolPermissionContext
                  if (ctx) {
                    const warnings = findUnreachablePermissionRules(ctx)
                    if (warnings.length > 0) {
                      options?.onPermissionRuleWarnings?.(warnings)
                    }
                  }
                }
                if (allowOptions?.updatedInput) {
                  resolve({
                    result: true,
                    updatedInput: allowOptions.updatedInput,
                  })
                  return
                }

                resolve({ result: true })
              },
              onReject(rejectionMessage) {
                resolveWithCancelledAndAbortAllToolCalls(rejectionMessage)
              },
            })
          })
          .catch(error => {
            if (error instanceof AbortError) {
              logCancelledEvent()
              resolveWithCancelledAndAbortAllToolCalls()
            } else {
              logError(error)
            }
          })
      })
    },
    [setToolUseConfirm],
  )
}

export default useCanUseTool
