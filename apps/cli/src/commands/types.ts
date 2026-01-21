import type { MessageParam } from '@anthropic-ai/sdk/resources/index.mjs'
import type { ReactNode } from 'react'

import type { Message } from '#core/query'
import type { Tool, ToolUseContext } from '#core/tooling/Tool'

export type PromptCommand = {
  type: 'prompt'
  progressMessage: string
  argNames?: string[]
  getPromptForCommand(args: string): Promise<MessageParam[]>
}

export type LocalCommand = {
  type: 'local'
  call(
    args: string,
    context: {
      options: {
        commands: Command[]
        tools: Tool[]
        slowAndCapableModel: string
        openMessageSelector?: () => void
      }
      abortController: AbortController
      setForkConvoWithMessagesOnTheNextRender: (
        forkConvoWithMessages: Message[],
      ) => void
    },
  ): Promise<string>
}

export type LocalJSXCommand = {
  type: 'local-jsx'
  call(
    onDone: (result?: string) => void,
    context: ToolUseContext & {
      setForkConvoWithMessagesOnTheNextRender: (
        forkConvoWithMessages: Message[],
      ) => void
    },
    args?: string,
  ): Promise<ReactNode>
}

export type Command = {
  description: string
  isEnabled: boolean
  isHidden: boolean
  name: string
  ui?: {
    displayMode?: 'inline' | 'fullscreen'
  }
  /**
   * Optional hint text for command arguments shown in help/menus.
   * Example: "[style]" or "<tag-name>".
   */
  argumentHint?: string
  aliases?: string[]
  /**
   * If true, this command must not be invoked via non-interactive tool calls
   * (e.g. SlashCommandTool / SkillTool).
   */
  disableNonInteractive?: boolean
  /**
   * Optional pre-approved tools for command execution (compatibility).
   */
  allowedTools?: string[]
  userFacingName(): string
} & (PromptCommand | LocalCommand | LocalJSXCommand)
