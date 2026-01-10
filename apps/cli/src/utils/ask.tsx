import { last } from 'lodash-es'
import type { Command } from '#cli-commands'
import { getSystemPrompt } from '#core/constants/prompts'
import { getContext } from '#core/context'
import { getTotalCost } from '#core/cost-tracker'
import { Message, query } from '#core/query'
import type { CanUseToolFn } from '#core/permissions/canUseTool'
import { Tool } from '#core/tooling/Tool'
import { getModelManager } from '#core/utils/model'
import { setCwd } from '#core/utils/state'
import { getMessagesPath, overwriteLog } from '#core/utils/log'
import { createUserMessage } from '#core/utils/messages'

type Props = {
  commands: Command[]
  safeMode?: boolean
  hasPermissionsToUseTool: CanUseToolFn
  messageLogName: string
  prompt: string
  cwd: string
  tools: Tool[]
  verbose?: boolean
  initialMessages?: Message[]
  persistSession?: boolean
}

// Sends a single prompt to the Anthropic Messages API and returns the response.
// Assumes the CLI is being used non-interactively: it will not ask the user
// for permissions or further input.
export async function ask({
  commands,
  safeMode,
  hasPermissionsToUseTool,
  messageLogName,
  prompt,
  cwd,
  tools,
  verbose = false,
  initialMessages,
  persistSession = true,
}: Props): Promise<{
  resultText: string
  totalCost: number
  messageHistoryFile: string
}> {
  await setCwd(cwd)
  const message = createUserMessage(prompt)
  const messages: Message[] = [...(initialMessages ?? []), message]

  const [systemPrompt, context, model] = await Promise.all([
    getSystemPrompt(),
    getContext(),
    getModelManager().getModelName('main'),
  ])

  for await (const m of query(
    messages,
    systemPrompt,
    context,
    hasPermissionsToUseTool,
    {
      options: {
        commands,
        tools,
        verbose,
        safeMode,
        forkNumber: 0,
        messageLogName: 'unused',
        maxThinkingTokens: 0,
        persistSession,
      },
      abortController: new AbortController(),
      messageId: undefined,
      readFileTimestamps: {},
      setToolJSX: () => {}, // No-op function for non-interactive use
    },
  )) {
    messages.push(m)
  }

  const result = last(messages)
  if (!result || result.type !== 'assistant') {
    throw new Error('Expected content to be an assistant message')
  }

  // Filter out thinking blocks from content
  const textContent = result.message.content.find(c => c.type === 'text')
  if (!textContent) {
    throw new Error(
      `Expected at least one text content item, but got ${JSON.stringify(
        result.message.content,
        null,
        2,
      )}`,
    )
  }

  // Write a message log that can be viewed with `kode log`
  const messageHistoryFile = getMessagesPath(messageLogName, 0, 0)
  overwriteLog(messageHistoryFile, messages)

  return {
    resultText: textContent.text,
    totalCost: getTotalCost(),
    messageHistoryFile,
  }
}
