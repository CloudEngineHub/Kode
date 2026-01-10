import { z } from 'zod'
import { Tool } from '#core/tooling/Tool'
import type { Message } from '#core/query'
import { createUserMessage } from '#core/utils/messages'
import { TOOL_NAME_FOR_PROMPT } from './prompt'
import {
  findCommand,
  getCommandAllowedToolsFromContext,
  getCommandFlags,
  getCommandOverrides,
  parseSlashCommand,
} from './utils'

const inputSchema = z.strictObject({
  command: z
    .string()
    .describe(
      'The slash command to execute with its arguments, e.g., "/review-pr 123"',
    ),
})

type Input = z.infer<typeof inputSchema>
type Output = {
  success: boolean
  commandName: string
}

type PromptLikeCommand = {
  type: 'prompt'
  name: string
  userFacingName?: () => string
  getPromptForCommand: (args: string) => Promise<Array<{ content: unknown }>>
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

function isPromptLikeCommand(value: unknown): value is PromptLikeCommand {
  const record = asRecord(value)
  return (
    record?.type === 'prompt' &&
    typeof record.name === 'string' &&
    typeof record.getPromptForCommand === 'function'
  )
}

function isTextContentBlock(
  value: unknown,
): value is { type: 'text'; text: string } {
  const record = asRecord(value)
  return record?.type === 'text' && typeof record.text === 'string'
}

function contentToText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map(b => (isTextContentBlock(b) ? b.text : ''))
    .join('\n')
    .trim()
}

function getCommandName(cmd: PromptLikeCommand): string {
  const userFacing =
    typeof cmd.userFacingName === 'function' ? cmd.userFacingName() : ''
  return userFacing || cmd.name
}

export const SlashCommandTool = {
  name: TOOL_NAME_FOR_PROMPT,
  async description({ command }: Input) {
    return `Execute slash command: ${command}`
  },
  userFacingName() {
    return 'SlashCommand'
  },
  inputSchema,
  isReadOnly() {
    return false
  },
  isConcurrencySafe() {
    return false
  },
  async isEnabled() {
    return true
  },
  needsPermissions() {
    return true
  },
  async prompt() {
    return `Execute a slash command within the main conversation

How slash commands work:
When you use this tool or when a user types a slash command, you will see <command-message>{name} is running…</command-message> followed by the expanded prompt. For example, if .claude/commands/foo.md contains "Print today's date", then /foo expands to that prompt in the next message.

Usage:
- \`command\` (required): The slash command to execute, including any arguments
- Example: \`command: "/review-pr 123"\`

IMPORTANT: Only use this tool for custom slash commands that are available in the current host. Do NOT use for:
- Built-in CLI commands (like /help, /clear, etc.)
- Commands you think might exist but are not available

Notes:
- When a user requests multiple slash commands, execute each one sequentially and check for <command-message>{name} is running…</command-message> to verify each has been processed
- Do not invoke a command that is already running. For example, if you see <command-message>foo is running…</command-message>, do NOT use this tool with "/foo" - process the expanded prompt in the following message
- If a user's command is not available, ask them to check the slash command file and consult the docs.
`
  },
  renderToolUseMessage({ command }: Input, _options: { verbose: boolean }) {
    return command || ''
  },
  renderResultForAssistant(output: Output) {
    return `Launching command: /${output.commandName}`
  },
  async validateInput({ command }: Input, context) {
    const parsed = parseSlashCommand(command)
    if (!parsed) {
      return {
        result: false,
        message: `Invalid slash command format: ${command}`,
        errorCode: 1,
      }
    }

    const commands = Array.isArray(context?.options?.commands)
      ? context.options.commands
      : []

    const cmd = findCommand(parsed.commandName, commands)
    if (!cmd) {
      return {
        result: false,
        message: `Unknown slash command: ${parsed.commandName}`,
        errorCode: 2,
      }
    }

    const flags = getCommandFlags(cmd)
    if (flags.disableModelInvocation) {
      return {
        result: false,
        message: `Slash command ${parsed.commandName} cannot be used with ${TOOL_NAME_FOR_PROMPT} tool due to disable-model-invocation`,
        errorCode: 4,
      }
    }

    if (flags.disableNonInteractive) {
      return {
        result: false,
        message: `Slash command ${parsed.commandName} cannot be used with ${TOOL_NAME_FOR_PROMPT} tool because it is non-interactive`,
        errorCode: 6,
      }
    }

    if (!isPromptLikeCommand(cmd)) {
      return {
        result: false,
        message: `Slash command ${parsed.commandName} is not a prompt-based command`,
        errorCode: 5,
      }
    }

    return { result: true }
  },
  async *call({ command }: Input, context) {
    const parsed = parseSlashCommand(command)
    if (!parsed) {
      throw new Error(`Invalid slash command format: ${command}`)
    }

    const commands = Array.isArray(context.options?.commands)
      ? context.options.commands
      : []
    const cmdUnknown = findCommand(parsed.commandName, commands)
    if (!cmdUnknown) {
      throw new Error(`Unknown slash command: ${parsed.commandName}`)
    }
    const flags = getCommandFlags(cmdUnknown)
    if (flags.disableModelInvocation) {
      throw new Error(
        `Slash command ${parsed.commandName} cannot be used with ${TOOL_NAME_FOR_PROMPT} tool due to disable-model-invocation`,
      )
    }
    if (flags.disableNonInteractive) {
      throw new Error(
        `Slash command ${parsed.commandName} cannot be used with ${TOOL_NAME_FOR_PROMPT} tool because it is non-interactive`,
      )
    }
    if (!isPromptLikeCommand(cmdUnknown)) {
      throw new Error(
        `Slash command ${parsed.commandName} is not a prompt-based command. Use /${parsed.commandName} directly in the main conversation.`,
      )
    }

    const cmd = cmdUnknown
    const prompt = await cmd.getPromptForCommand(parsed.args)
    const expandedMessages: Message[] = prompt.map(msg => {
      const userMessage = createUserMessage(contentToText(msg.content))
      userMessage.options = {
        ...userMessage.options,
        isCustomCommand: true,
        commandName: getCommandName(cmd),
        commandArgs: parsed.args,
      }
      return userMessage
    })

    const commandNameForMeta = getCommandName(cmd)
    const { progressMessage, allowedTools, model, maxThinkingTokens } =
      getCommandOverrides(cmd)
    const metaMessage =
      createUserMessage(`<command-name>${commandNameForMeta}</command-name>
<command-message>${commandNameForMeta} is ${progressMessage}…</command-message>
<command-args>${parsed.args}</command-args>`)

    const output: Output = { success: true, commandName: parsed.commandName }

    yield {
      type: 'result' as const,
      data: output,
      resultForAssistant: this.renderResultForAssistant(output),
      newMessages: [metaMessage, ...expandedMessages],
      contextModifier:
        allowedTools.length > 0 || model || maxThinkingTokens !== undefined
          ? {
              modifyContext(ctx) {
                const next = { ...ctx }

                if (allowedTools.length > 0) {
                  const prev = getCommandAllowedToolsFromContext(next)
                  next.options = {
                    ...(next.options || {}),
                    commandAllowedTools: [
                      ...new Set([...prev, ...allowedTools]),
                    ],
                  }
                }

                if (model) {
                  next.options = { ...(next.options || {}), model }
                }

                if (maxThinkingTokens !== undefined) {
                  next.options = {
                    ...(next.options || {}),
                    maxThinkingTokens,
                  }
                }

                return next
              },
            }
          : undefined,
    }
  },
} satisfies Tool<typeof inputSchema, Output>
