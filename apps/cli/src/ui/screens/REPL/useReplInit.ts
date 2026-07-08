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
  const {
    commands,
    forkNumber,
    initialPrompt,
    mcpClients,
    messageLogName,
    messages,
    onQuery,
    readFileTimestamps,
    reverify,
    safeMode,
    setAbortController,
    setForkConvoWithMessagesOnTheNextRender,
    setHaveShownCostDialog,
    setIsLoading,
    setToolJSX,
    tools,
    verbose,
  } = args

  return useCallback(async () => {
    reverify()

    if (!initialPrompt) return

    setIsLoading(true)
    const controller = new AbortController()
    setAbortController(controller)

    try {
      const newMessages = await processUserInput(
        initialPrompt,
        'prompt',
        setToolJSX,
        {
          abortController: controller,
          options: {
            commands,
            forkNumber,
            messageLogName,
            tools,
            mcpClients,
            verbose,
            maxThinkingTokens: 0,
            toolPermissionContext: getToolPermissionContextForConversationKey({
              conversationKey: `${messageLogName}:${forkNumber}`,
              isBypassPermissionsModeAvailable: !safeMode,
            }),
          } satisfies ToolUseContext['options'],
          messageId: getLastAssistantMessageId(messages),
          setForkConvoWithMessagesOnTheNextRender:
            setForkConvoWithMessagesOnTheNextRender,
          readFileTimestamps,
        } satisfies ToolUseContext & {
          setForkConvoWithMessagesOnTheNextRender: SetForkConvoWithMessagesOnTheNextRender
        },
        null,
      )

      if (newMessages.length) {
        for (const message of newMessages) {
          if (message.type === 'user') addToHistory(initialPrompt)
        }
        await onQuery(newMessages, controller)
      } else {
        addToHistory(initialPrompt)
      }

      setHaveShownCostDialog(
        Boolean(getGlobalConfig().hasAcknowledgedCostThreshold),
      )
    } finally {
      setIsLoading(false)
      setAbortController(null)
    }
  }, [
    commands,
    forkNumber,
    initialPrompt,
    mcpClients,
    messageLogName,
    messages,
    onQuery,
    readFileTimestamps,
    reverify,
    safeMode,
    setAbortController,
    setForkConvoWithMessagesOnTheNextRender,
    setHaveShownCostDialog,
    setIsLoading,
    setToolJSX,
    tools,
    verbose,
  ])
}
