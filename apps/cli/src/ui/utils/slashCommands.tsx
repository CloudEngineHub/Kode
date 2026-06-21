import * as React from 'react'
import type { Message } from '#core/query'
import { getCommand } from '#cli-commands'
import { MalformedCommandError } from '#core/utils/errors'
import { logError } from '#core/utils/log'
import type { SetToolJSXFn, ToolUseContext } from '#core/tooling/Tool'
import {
  createAssistantMessage,
  createUserMessage,
  NO_RESPONSE_REQUESTED,
} from '#core/utils/messages'
import type { SetForkConvoWithMessagesOnTheNextRender } from '#ui-ink/types/conversationReset'

export async function getMessagesForSlashCommand(
  commandName: string,
  args: string,
  setToolJSX: SetToolJSXFn<React.ReactNode>,
  context: ToolUseContext & {
    setForkConvoWithMessagesOnTheNextRender: SetForkConvoWithMessagesOnTheNextRender
  },
): Promise<Message[]> {
  try {
    const command = getCommand(commandName, context.options.commands)

    switch (command.type) {
      case 'local-jsx': {
        return new Promise(resolveMessages => {
          let didMountJsx = false
          command
            .call(
              r => {
                setToolJSX(null)

                // Interactive local JSX commands (fullscreen overlays, selectors, etc.)
                // should not pollute the transcript with command meta messages unless
                // they explicitly return output.
                if (didMountJsx) {
                  if (!r || r === NO_RESPONSE_REQUESTED) {
                    resolveMessages([])
                    return
                  }
                  resolveMessages([createAssistantMessage(r)])
                  return
                }

                resolveMessages([
                  createUserMessage(`<command-name>${command.userFacingName()}</command-name>
          <command-message>${command.userFacingName()}</command-message>
          <command-args>${args}</command-args>`),
                  r
                    ? createAssistantMessage(r)
                    : createAssistantMessage(NO_RESPONSE_REQUESTED),
                ])
              },
              context,
              args,
            )
            .then(jsx => {
              if (!jsx) return
              didMountJsx = true
              setToolJSX({
                jsx,
                shouldHidePromptInput: true,
                displayMode: command.ui?.displayMode ?? 'inline',
              })
            })
        })
      }

      case 'local': {
        const userMessage =
          createUserMessage(`<command-name>${command.userFacingName()}</command-name>
        <command-message>${command.userFacingName()}</command-message>
        <command-args>${args}</command-args>`)

        try {
          const baseOptions = context.options ?? {}
          // Use the context's abortController for local commands
          const result = await command.call(args, {
            ...context,
            options: {
              ...baseOptions,
              commands: baseOptions.commands ?? [],
              tools: baseOptions.tools ?? [],
              slowAndCapableModel: baseOptions.slowAndCapableModel ?? 'main',
            },
          })

          return [
            userMessage,
            createAssistantMessage(
              `<local-command-stdout>${result}</local-command-stdout>`,
            ),
          ]
        } catch (e) {
          logError(e)
          return [
            userMessage,
            createAssistantMessage(
              `<local-command-stderr>${String(e)}</local-command-stderr>`,
            ),
          ]
        }
      }

      case 'prompt': {
        // Compatibility: emit a metadata message, then the expanded prompt.
        const commandName = command.userFacingName()
        const progressMessage = command.progressMessage || 'running'
        const metaMessage =
          createUserMessage(`<command-name>${commandName}</command-name>
        <command-message>${commandName} is ${progressMessage}…</command-message>
        <command-args>${args}</command-args>`)

        const prompt = await command.getPromptForCommand(args)
        const expandedMessages = prompt.map(msg => {
          // Create a normal user message from the custom command content
          const userMessage = createUserMessage(
            typeof msg.content === 'string'
              ? msg.content
              : msg.content
                  .map(block => (block.type === 'text' ? block.text : ''))
                  .join('\n'),
          )

          // Add metadata for tracking but don't wrap in special tags
          userMessage.options = {
            ...userMessage.options,
            isCustomCommand: true,
            commandName: command.userFacingName(),
            commandArgs: args,
          }

          return userMessage
        })

        return [metaMessage, ...expandedMessages]
      }
    }
  } catch (e) {
    if (e instanceof MalformedCommandError) {
      return [createAssistantMessage(e.message)]
    }
    throw e
  }
}
