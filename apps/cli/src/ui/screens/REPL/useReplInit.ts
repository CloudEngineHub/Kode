import { useCallback } from 'react'
import { addToHistory } from '#core/history'
import { getGlobalConfig } from '#core/utils/config'
import { getLastAssistantMessageId } from '#core/utils/messages'
import { processUserInput } from '#ui-ink/utils/processUserInput'
import type { Command } from '#cli-commands'
import type { Message as MessageType } from '#core/query'
import type { WrappedClient } from '#core/mcp/client'
import type { ToolUseContext, Tool } from '#core/tooling/Tool'
import { getToolPermissionContextForConversationKey } from '#core/utils/toolPermissionContextState'
import type { SetForkConvoWithMessagesOnTheNextRender } from '#ui-ink/types/conversationReset'

export function useReplInit(args: {
  initialPrompt: string | undefined
  commands: Command[]
  forkNumber: number
  messageLogName: string
  tools: Tool[]
  mcpClients: WrappedClient[]
  verbose: boolean
  safeMode: boolean
  messages: MessageType[]
  setToolJSX: (jsx: any) => void
  readFileTimestamps: { [filename: string]: number }
  setForkConvoWithMessagesOnTheNextRender: SetForkConvoWithMessagesOnTheNextRender
  reverify: () => void
  setIsLoading: (isLoading: boolean) => void
  setAbortController: (abortController: AbortController | null) => void
  setHaveShownCostDialog: (value: boolean) => void
  onQuery: (
    newMessages: MessageType[],
    passedAbortController?: AbortController,
  ) => Promise<void>
}) {
  return useCallback(async () => {
    args.reverify()

    if (!args.initialPrompt) return

    args.setIsLoading(true)
    const controller = new AbortController()
    args.setAbortController(controller)

    try {
      const newMessages = await processUserInput(
        args.initialPrompt,
        'prompt',
        args.setToolJSX,
        {
          abortController: controller,
          options: {
            commands: args.commands,
            forkNumber: args.forkNumber,
            messageLogName: args.messageLogName,
            tools: args.tools,
            mcpClients: args.mcpClients,
            verbose: args.verbose,
            maxThinkingTokens: 0,
            toolPermissionContext: getToolPermissionContextForConversationKey({
              conversationKey: `${args.messageLogName}:${args.forkNumber}`,
              isBypassPermissionsModeAvailable: !args.safeMode,
            }),
          } satisfies ToolUseContext['options'],
          messageId: getLastAssistantMessageId(args.messages),
          setForkConvoWithMessagesOnTheNextRender:
            args.setForkConvoWithMessagesOnTheNextRender,
          readFileTimestamps: args.readFileTimestamps,
        } satisfies ToolUseContext & {
          setForkConvoWithMessagesOnTheNextRender: SetForkConvoWithMessagesOnTheNextRender
        },
        null,
      )

      if (newMessages.length) {
        for (const message of newMessages) {
          if (message.type === 'user') addToHistory(args.initialPrompt)
        }
        await args.onQuery(newMessages, controller)
      } else {
        addToHistory(args.initialPrompt)
      }

      args.setHaveShownCostDialog(
        Boolean(getGlobalConfig().hasAcknowledgedCostThreshold),
      )
    } finally {
      args.setIsLoading(false)
      args.setAbortController(null)
    }
  }, [args])
}
