import { useCallback, type ReactNode } from 'react'
import { getContext } from '@kode/context'
import { getMaxThinkingTokens } from '#core/utils/thinking'
import { getLastAssistantMessageId } from '#core/utils/messages'
import { buildSystemPromptForSession, runTurn } from '@kode/engine'
import { handleHashCommand } from '#core/utils/hashCommand'
import { logError } from '#core/utils/log'
import { debug as debugLogger } from '#core/utils/debugLogger'
import { getToolPermissionContextForConversationKey } from '#core/utils/toolPermissionContextState'
import type {
  AssistantMessage,
  BinaryFeedbackResult,
  Message as MessageType,
} from '#core/query'
import type { CanUseToolFn } from '#core/permissions/canUseTool'
import type { SetToolJSXFn, Tool, ToolUseContext } from '#core/tooling/Tool'
import type { WrappedClient } from '#core/mcp/client'
import { markProjectOnboardingComplete } from '#ui-ink/components/ProjectOnboarding'
import type { Command } from '#cli-commands'
import {
  getOutputStyleSystemPromptAdditions,
  getCurrentOutputStyleDefinition,
} from '#cli-services/outputStyles'
import type {
  AssistantStreamStore,
  AssistantStreamUpdateEvent,
} from './assistantStreamStore'

export function appendMessagesForReplState(
  oldMessages: MessageType[],
  newMessages: MessageType[],
): MessageType[] {
  if (newMessages.length === 0) return oldMessages

  let next: MessageType[] | null = null
  const getNext = () => {
    next ??= [...oldMessages]
    return next
  }

  for (const message of newMessages) {
    if (message.type === 'progress') {
      const current = next ?? oldMessages
      const existingIndex = current.findIndex(
        item =>
          item.type === 'progress' && item.toolUseID === message.toolUseID,
      )
      if (existingIndex >= 0) {
        getNext()[existingIndex] = message
        continue
      }
    }

    getNext().push(message)
  }

  return next ?? oldMessages
}

export async function runReplQueryWithCleanup<T>(args: {
  controller: AbortController
  assistantStreamStore: Pick<AssistantStreamStore, 'endTurn'>
  clearAbortController: (controller: AbortController) => boolean
  setIsLoading: (isLoading: boolean) => void
  execute: () => Promise<T>
}): Promise<T> {
  try {
    return await args.execute()
  } finally {
    try {
      args.assistantStreamStore.endTurn(args.controller)
    } finally {
      if (args.clearAbortController(args.controller)) {
        args.setIsLoading(false)
      }
    }
  }
}

export function useReplQuery(args: {
  disableSlashCommands: boolean
  systemPromptOverride?: string
  appendSystemPrompt?: string
  messages: MessageType[]
  setMessages: React.Dispatch<React.SetStateAction<MessageType[]>>
  commands: Command[]
  forkNumber: number
  messageLogName: string
  thinkingMode?: 'auto' | 'enabled' | 'disabled'
  tools: Tool[]
  mcpClients: WrappedClient[]
  verbose: boolean
  safeMode: boolean
  checkPendingForkAndSuppressAppend?: (newMessages: MessageType[]) => boolean
  requestToolUsePermission: NonNullable<
    ToolUseContext['options']
  >['requestToolUsePermission']
  canUseTool: CanUseToolFn
  readFileTimestamps: { [filename: string]: number }
  setToolJSX: SetToolJSXFn<ReactNode>
  getBinaryFeedbackResponse: (
    m1: AssistantMessage,
    m2: AssistantMessage,
  ) => Promise<BinaryFeedbackResult>
  setAbortController: (abortController: AbortController | null) => void
  clearAbortController: (abortController: AbortController) => boolean
  setIsLoading: (isLoading: boolean) => void
  assistantStreamStore: AssistantStreamStore
}): (
  newMessages: MessageType[],
  passedAbortController?: AbortController,
) => Promise<void> {
  const {
    appendSystemPrompt,
    assistantStreamStore,
    canUseTool,
    checkPendingForkAndSuppressAppend,
    clearAbortController,
    commands,
    disableSlashCommands,
    forkNumber,
    getBinaryFeedbackResponse,
    mcpClients,
    messageLogName,
    messages,
    readFileTimestamps,
    requestToolUsePermission,
    safeMode,
    setAbortController,
    setIsLoading,
    setMessages,
    setToolJSX,
    systemPromptOverride,
    thinkingMode,
    tools,
    verbose,
  } = args

  return useCallback(
    async (
      newMessages: MessageType[],
      passedAbortController?: AbortController,
    ) => {
      const controllerToUse = passedAbortController || new AbortController()
      if (!passedAbortController) {
        setAbortController(controllerToUse)
      }

      await runReplQueryWithCleanup({
        controller: controllerToUse,
        assistantStreamStore,
        clearAbortController,
        setIsLoading,
        execute: async () => {
          try {
            const shouldSuppressAppend =
              checkPendingForkAndSuppressAppend?.(newMessages) ?? false
            if (shouldSuppressAppend) return

            const isKodingRequest =
              newMessages.length > 0 &&
              newMessages[0].type === 'user' &&
              newMessages[0].options?.isKodingRequest === true

            setMessages(oldMessages =>
              appendMessagesForReplState(oldMessages, newMessages),
            )

            markProjectOnboardingComplete()

            const lastMessage = newMessages[newMessages.length - 1]!
            if (lastMessage.type === 'assistant') return

            const outputStyle = getCurrentOutputStyleDefinition()
            const [systemPrompt, context, maxThinkingTokens] =
              await Promise.all([
                buildSystemPromptForSession({
                  disableSlashCommands,
                  systemPromptOverride,
                  appendSystemPrompt,
                  outputStyleActive: outputStyle !== null,
                  keepCodingInstructions: outputStyle?.keepCodingInstructions,
                }),
                getContext(),
                getMaxThinkingTokens([...messages, lastMessage], {
                  thinkingMode,
                }),
              ])

            let lastAssistantMessage: MessageType | null = null
            assistantStreamStore.beginTurn(controllerToUse)
            const toolUseOptions = {
              commands,
              forkNumber,
              messageLogName,
              tools,
              mcpClients,
              verbose,
              safeMode,
              maxThinkingTokens,
              thinkingMode,
              requestToolUsePermission,
              isKodingRequest: isKodingRequest || undefined,
              toolPermissionContext: getToolPermissionContextForConversationKey(
                {
                  conversationKey: `${messageLogName}:${forkNumber}`,
                  isBypassPermissionsModeAvailable: !safeMode,
                },
              ),
              getCustomSystemPromptAdditions:
                getOutputStyleSystemPromptAdditions,
              onAssistantStreamUpdate: (event: AssistantStreamUpdateEvent) => {
                assistantStreamStore.handleUpdate(controllerToUse, event)
              },
            }

            for await (const message of runTurn({
              messages: [...messages, lastMessage],
              systemPrompt,
              context,
              canUseTool,
              toolUseContext: {
                agentId: 'main',
                options: toolUseOptions,
                messageId: getLastAssistantMessageId([
                  ...messages,
                  lastMessage,
                ]),
                readFileTimestamps,
                abortController: controllerToUse,
                setToolJSX,
              },
              getBinaryFeedbackResponse,
            })) {
              if (message.type === 'assistant') {
                assistantStreamStore.clearPreview(controllerToUse)
              }
              setMessages(oldMessages =>
                appendMessagesForReplState(oldMessages, [message]),
              )
              if (message.type === 'assistant') {
                lastAssistantMessage = message
              }
            }

            if (
              isKodingRequest &&
              lastAssistantMessage &&
              lastAssistantMessage.type === 'assistant'
            ) {
              try {
                const content =
                  typeof lastAssistantMessage.message.content === 'string'
                    ? lastAssistantMessage.message.content
                    : lastAssistantMessage.message.content
                        .filter(block => block.type === 'text')
                        .map(block => (block.type === 'text' ? block.text : ''))
                        .join('\n')

                if (content && content.trim().length > 0) {
                  handleHashCommand(content)
                }
              } catch (error) {
                logError(error)
                debugLogger.error('REPL_KODING_SAVE_PROJECT_DOCS_ERROR', {
                  error,
                })
              }
            }
          } catch (error) {
            logError(error)
            debugLogger.error('REPL_QUERY_ERROR', { error })
          }
        },
      })
    },
    [
      appendSystemPrompt,
      assistantStreamStore,
      canUseTool,
      checkPendingForkAndSuppressAppend,
      clearAbortController,
      commands,
      disableSlashCommands,
      forkNumber,
      getBinaryFeedbackResponse,
      mcpClients,
      messageLogName,
      messages,
      readFileTimestamps,
      requestToolUsePermission,
      safeMode,
      setAbortController,
      setIsLoading,
      setMessages,
      setToolJSX,
      systemPromptOverride,
      thinkingMode,
      tools,
      verbose,
    ],
  )
}
