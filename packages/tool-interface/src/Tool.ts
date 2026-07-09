import type { z } from 'zod'
import type { CommandSource } from './commandSource'
import type { PermissionMode, ToolPermissionContext } from './permissions'

export type ToolRenderOutput = unknown

export type AssistantStreamUpdate =
  | {
      type: 'start'
      agentId?: string
      requestId?: string
    }
  | {
      type: 'text_delta'
      delta: string
      agentId?: string
      requestId?: string
    }

export type SetToolJSXFn<TRenderable = ToolRenderOutput> = (
  jsx: {
    jsx: TRenderable | null
    shouldHidePromptInput: boolean
    displayMode?: 'inline' | 'fullscreen'
  } | null,
) => void

export interface ToolUseContext {
  messageId: string | undefined
  toolUseId?: string
  agentId?: string
  requestId?: string
  safeMode?: boolean
  commandSource?: CommandSource
  abortController: AbortController
  readFileTimestamps: { [filePath: string]: number }
  readFileHashes?: { [filePath: string]: string }
  options?: {
    commands?: any[]
    tools?: any[]
    verbose?: boolean
    slowAndCapableModel?: string
    safeMode?: boolean
    permissionMode?: PermissionMode
    toolPermissionContext?: ToolPermissionContext
    lastUserPrompt?: string
    getCustomSystemPromptAdditions?: () => string[]
    openMessageSelector?: () => void
    onStreamEvent?: (event: unknown) => void
    onAssistantStreamUpdate?: (
      event: AssistantStreamUpdate,
    ) => void | Promise<void>
    maxBudgetUsd?: number
    maxTurns?: number
    forkNumber?: number
    messageLogName?: string
    forceForkContext?: boolean
    maxThinkingTokens?: any
    thinkingMode?: 'auto' | 'enabled' | 'disabled'
    model?: string
    commandAllowedTools?: string[]
    isKodingRequest?: boolean
    kodingContext?: string
    isCustomCommand?: boolean
    mcpClients?: any[]
    bashLlmGateQuery?: (args: {
      systemPrompt: string[]
      userInput: string
      signal: AbortSignal
      model?: 'quick' | 'main'
    }) => Promise<string>
    disableSlashCommands?: boolean
    persistSession?: boolean
    shouldAvoidPermissionPrompts?: boolean
    requestToolUsePermission?: (
      request: {
        tool: any
        description: string
        input: { [key: string]: unknown }
        commandPrefix: any | null
        suggestions?: any[]
        riskScore: number | null
      },
      toolUseContext: ToolUseContext,
    ) => Promise<
      | { result: true; type: 'permanent' | 'temporary' }
      | { result: false; rejectionMessage?: string }
    >
    __sandboxProjectDir?: string
    __sandboxHomeDir?: string
    __sandboxPlatform?: NodeJS.Platform
    __sandboxBwrapPath?: string | null
    __sandboxSocatPath?: string | null
    __sandboxApplySeccompPath?: string | null
    __sandboxSeccompBpfPath?: string | null
    askUserQuestionAnswersByToolUseId?: Record<string, Record<string, string>>
    askUserQuestionAnswers?: Record<string, string>
  }
  responseState?: {
    previousResponseId?: string
    conversationId?: string
  }
}

export interface ExtendedToolUseContext extends ToolUseContext {
  setToolJSX: SetToolJSXFn
}

export interface ValidationResult {
  result: boolean
  message?: string
  errorCode?: number
  meta?: any
}

export interface ToolMetadata<
  TInput extends z.ZodTypeAny = z.ZodTypeAny,
  TOutput = any,
> {
  name: string
  maxResultSizeChars?: number
  isMcp?: boolean
  description?: string | ((input?: z.infer<TInput>) => Promise<string>)
  inputSchema: TInput
  inputJSONSchema?: Record<string, unknown>
  prompt: (options?: { safeMode?: boolean; tools?: Tool[] }) => Promise<string>
  userFacingName?: (input?: z.infer<TInput>) => string
  cachedDescription?: string
  isEnabled: () => Promise<boolean>
  isReadOnly: (input?: z.infer<TInput>) => boolean
  isConcurrencySafe: (input?: z.infer<TInput>) => boolean
  needsPermissions: (input?: z.infer<TInput>) => boolean
  requiresUserInteraction?: (input?: z.infer<TInput>) => boolean
  validateInput?: (
    input: z.infer<TInput>,
    context?: ToolUseContext,
  ) => Promise<ValidationResult>
  renderResultForAssistant: (output: TOutput) => string | any[]
}

export interface ToolPresenter<
  TInput extends z.ZodTypeAny = z.ZodTypeAny,
  TOutput = any,
> {
  name: string
  renderToolUseMessage: (
    input: z.infer<TInput>,
    options: { verbose: boolean },
  ) => ToolRenderOutput
  renderToolUseRejectedMessage?: (...args: any[]) => ToolRenderOutput
  renderToolResultMessage?: (
    output: TOutput,
    options: { verbose: boolean },
  ) => ToolRenderOutput
}

export interface ToolRunner<
  TInput extends z.ZodTypeAny = z.ZodTypeAny,
  TOutput = any,
> {
  name: string
  call: (
    input: z.infer<TInput>,
    context: ToolUseContext,
  ) => AsyncGenerator<
    | {
        type: 'result'
        data: TOutput
        resultForAssistant?: string | any[]
        newMessages?: unknown[]
        contextModifier?: {
          modifyContext: (ctx: ToolUseContext) => ToolUseContext
        }
      }
    | {
        type: 'progress'
        content: any
        normalizedMessages?: any[]
        tools?: any[]
      },
    void,
    unknown
  >
}

export interface Tool<TInput extends z.ZodTypeAny = z.ZodTypeAny, TOutput = any>
  extends
    ToolMetadata<TInput, TOutput>,
    ToolPresenter<TInput, TOutput>,
    ToolRunner<TInput, TOutput> {}

export async function resolveToolDescription<
  TInput extends z.ZodTypeAny = z.ZodTypeAny,
>(tool: Tool<TInput>, input?: z.infer<TInput>): Promise<string> {
  if (input === undefined && tool.cachedDescription) {
    return tool.cachedDescription
  }

  if (typeof tool.description === 'string') {
    if (input === undefined && !tool.cachedDescription) {
      tool.cachedDescription = tool.description
    }
    return tool.description
  }

  if (typeof tool.description === 'function') {
    try {
      const resolved = await tool.description(input)
      const description =
        typeof resolved === 'string' && resolved.trim()
          ? resolved
          : `Tool: ${tool.name}`
      if (input === undefined) {
        tool.cachedDescription = description
      }
      return description
    } catch {
      // Fall through to a safe fallback.
    }
  }

  const fallback = `Tool: ${tool.name}`
  if (input === undefined && !tool.cachedDescription) {
    tool.cachedDescription = fallback
  }
  return fallback
}

export function getToolDescription(tool: Tool): string {
  if (tool.cachedDescription) {
    return tool.cachedDescription
  }

  if (typeof tool.description === 'string') {
    return tool.description
  }

  return `Tool: ${tool.name}`
}
