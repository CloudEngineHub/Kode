import type { MessageParam } from '@anthropic-ai/sdk/resources/index.mjs'

export interface CustomCommandFrontmatter {
  description?: string
  'allowed-tools'?: string[]
  'argument-hint'?: string
  when_to_use?: string
  version?: string
  model?: string
  context?: string
  agent?: string
  maxThinkingTokens?: number | string
  max_thinking_tokens?: number | string
  'max-thinking-tokens'?: number | string
  name?: string
  'disable-model-invocation'?: boolean | string
}

export interface CustomCommandWithScope {
  type: 'prompt'
  name: string
  description: string
  isEnabled: boolean
  isHidden: boolean
  aliases?: string[]
  progressMessage: string
  userFacingName(): string
  getPromptForCommand(args: string): Promise<MessageParam[]>
  allowedTools?: string[]
  maxThinkingTokens?: number
  argumentHint?: string
  whenToUse?: string
  version?: string
  model?: string
  context?: 'fork'
  agent?: string
  isSkill?: boolean
  disableModelInvocation?: boolean
  hasUserSpecifiedDescription?: boolean
  source?: 'localSettings' | 'userSettings' | 'pluginDir'
  scope?: 'user' | 'project'
  filePath?: string
}

export interface CustomCommandFile {
  frontmatter: CustomCommandFrontmatter
  content: string
  filePath: string
}

export type CommandSource = 'localSettings' | 'userSettings' | 'pluginDir'

export type CommandFileRecord = {
  baseDir: string
  filePath: string
  frontmatter: CustomCommandFrontmatter
  content: string
  source: CommandSource
  scope: 'user' | 'project'
}
