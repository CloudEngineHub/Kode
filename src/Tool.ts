import { z } from 'zod'
import * as React from 'react'

export type SetToolJSXFn = (jsx: {
  jsx: React.ReactNode | null
  shouldHidePromptInput: boolean
} | null) => void

export interface ToolUseContext {
  messageId: string | undefined
  agentId?: string
  safeMode?: boolean
  abortController: AbortController
  readFileTimestamps: { [filePath: string]: number }
  options?: {
    commands?: any[]
    tools?: any[]
    verbose?: boolean
    slowAndCapableModel?: string
    safeMode?: boolean
    forkNumber?: number
    messageLogName?: string
    maxThinkingTokens?: any
    isKodingRequest?: boolean
    kodingContext?: string
    isCustomCommand?: boolean
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

export interface Tool<
  TInput extends z.ZodObject<any> = z.ZodObject<any>,
  TOutput = any,
> {
  name: string
  description?: () => Promise<string>
  inputSchema: TInput
  inputJSONSchema?: Record<string, unknown>
  prompt: (options?: { safeMode?: boolean }) => Promise<string>
  userFacingName?: () => string
  isEnabled: () => Promise<boolean>
  isReadOnly: () => boolean
  isConcurrencySafe: () => boolean
  needsPermissions: (input?: z.infer<TInput>) => boolean
  validateInput?: (
    input: z.infer<TInput>,
    context?: ToolUseContext,
  ) => Promise<ValidationResult>
  renderResultForAssistant: (output: TOutput) => string
  renderToolUseMessage: (
    input: z.infer<TInput>,
    options: { verbose: boolean },
  ) => string
  renderToolUseRejectedMessage: () => React.ReactElement
  renderToolResultMessage?: (output: TOutput) => React.ReactElement
  call: (
    input: z.infer<TInput>,
    context: ToolUseContext,
  ) => AsyncGenerator<
    { type: 'result'; data: TOutput; resultForAssistant?: string },
    void,
    unknown
  >
}
