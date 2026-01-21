import { z } from 'zod'
import type { PermissionMode } from '#core/types/PermissionMode'
import type { ToolPermissionContext } from '#core/types/toolPermissionContext'
import type { CommandSource } from '#protocol/commandSource'

/**
 * Core Tool interface for Kode's extensible tool system
 * Provides standardized contract for all tool implementations
 */

/**
 * Tool-facing render output type.
 *
 * Core must stay UI-framework-agnostic, so we intentionally avoid importing
 * React/Ink types here. Hosts (Ink/Web/etc.) may treat this as a renderable
 * node and narrow as needed.
 */
export type ToolRenderOutput = any

export type SetToolJSXFn<TRenderable = ToolRenderOutput> = (
  jsx: {
    jsx: TRenderable | null
    shouldHidePromptInput: boolean
    /**
     * Optional UI hint for the host renderer.
     * - `inline`: render within the REPL transcript layout (default).
     * - `fullscreen`: render as a modal-like fullscreen view (clears transcript).
     */
    displayMode?: 'inline' | 'fullscreen'
  } | null,
) => void

export interface ToolUseContext {
  messageId: string | undefined
  toolUseId?: string
  agentId?: string
  safeMode?: boolean
  /**
   * Used to distinguish user-initiated shell commands from agent-initiated ones.
   * Impacts sandboxing + safety gates for tools like Bash.
   */
  commandSource?: CommandSource
  abortController: AbortController
  readFileTimestamps: { [filePath: string]: number }
  /**
   * Optional content hashes captured at read time, keyed by absolute file path.
   * Used to avoid false-positive "modified since read" guards when a file is
   * touched (mtime updated) without content changes.
   */
  readFileHashes?: { [filePath: string]: string }
  options?: {
    commands?: any[]
    tools?: any[]
    verbose?: boolean
    slowAndCapableModel?: string
    safeMode?: boolean
    permissionMode?: PermissionMode
    toolPermissionContext?: ToolPermissionContext
    /**
     * Plain-text content of the most recent user message before any internal
     * reminder injections. Used for intent-alignment checks (e.g. Bash gate).
     */
    lastUserPrompt?: string
    /**
     * Optional host hook to supply additional system prompt blocks.
     *
     * Used for compatibility/prompt-profile layers (e.g., reference-style
     * builders) without requiring every tool host to plumb custom prompt
     * additions through separate config objects.
     */
    getCustomSystemPromptAdditions?: () => string[]
    /**
     * Host-provided UI hook to open the message selector (rewind picker).
     *
     * Used by parity commands like `/rewind` without coupling core logic to Ink.
     */
    openMessageSelector?: () => void
    /**
     * Optional streaming callback invoked with provider-native stream events.
     *
     * Used by SDK/print-mode to optionally emit `stream_event` messages
     * (`--include-partial-messages`) without coupling core to any host UI.
     */
    onStreamEvent?: (event: unknown) => void
    /**
     * Optional total USD budget cap for non-interactive / SDK flows.
     * When the accumulated API cost meets or exceeds this value, core should
     * stop before making additional model calls.
     */
    maxBudgetUsd?: number
    /**
     * Optional max agentic turns cap for non-interactive / SDK flows.
     * When the number of model calls in the current run reaches this value,
     * core should stop before making additional model calls.
     */
    maxTurns?: number
    forkNumber?: number
    messageLogName?: string
    /**
     * Force including main-thread fork context messages when launching a sub-agent.
     * Used for legacy-compatible features like skill frontmatter `context: fork`.
     */
    forceForkContext?: boolean
    maxThinkingTokens?: any
    thinkingMode?: 'auto' | 'enabled' | 'disabled'
    model?: string
    commandAllowedTools?: string[]
    isKodingRequest?: boolean
    kodingContext?: string
    isCustomCommand?: boolean
    mcpClients?: any[]
    /**
     * Test-only override for the Bash LLM intent gate query function.
     * Allows unit tests to force deterministic gate results without calling real models.
     */
    bashLlmGateQuery?: (args: {
      systemPrompt: string[]
      userInput: string
      signal: AbortSignal
      model?: 'quick' | 'main'
    }) => Promise<string>
    disableSlashCommands?: boolean
    /**
     * When false, suppress legacy-compatible session persistence (.jsonl under config/projects).
     * Default: true for CLI sessions; some internal tools may opt out to avoid polluting session logs.
     */
    persistSession?: boolean
    /**
     * When true, the current execution context cannot show interactive permission prompts.
     * Any permission decision that would normally prompt should be auto-denied.
     */
    shouldAvoidPermissionPrompts?: boolean
    /**
     * Host-provided interactive permission prompt for tool-like permission flows that
     * happen inside a tool call (e.g. Bash sandbox network proxy bootstrap on macOS).
     *
     * When not provided, tools must fail closed (deny) without prompting.
     */
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
    /**
     * Test-only overrides for sandbox runtime decisions.
     * Used by the Bash sandbox permission matrix tests to emulate different
     * project/home/platform environments without touching the real filesystem.
     */
    __sandboxProjectDir?: string
    __sandboxHomeDir?: string
    __sandboxPlatform?: NodeJS.Platform
    __sandboxBwrapPath?: string | null
    __sandboxSocatPath?: string | null
    __sandboxApplySeccompPath?: string | null
    __sandboxSeccompBpfPath?: string | null
    /**
     * UI-collected answers for AskUserQuestion tool runs.
     * Stored by toolUseId to avoid mutating the tool input schema.
     */
    askUserQuestionAnswersByToolUseId?: Record<string, Record<string, string>>
    /**
     * Fallback storage for AskUserQuestion answers when toolUseId is unavailable.
     */
    askUserQuestionAnswers?: Record<string, string>
  }
  // GPT-5 Responses API state management
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

export interface Tool<
  TInput extends z.ZodTypeAny = z.ZodTypeAny,
  TOutput = any,
> {
  name: string
  maxResultSizeChars?: number
  /**
   * Compatibility note: MCP tools are tagged and treated specially (e.g. MCPSearch).
   * This stays optional so non-MCP tools do not need to care.
   */
  isMcp?: boolean
  description?: string | ((input?: z.infer<TInput>) => Promise<string>)
  inputSchema: TInput
  inputJSONSchema?: Record<string, unknown>
  prompt: (options?: { safeMode?: boolean; tools?: Tool[] }) => Promise<string>
  userFacingName?: (input?: z.infer<TInput>) => string
  /** Cached description for synchronous access by adapters */
  cachedDescription?: string
  isEnabled: () => Promise<boolean>
  isReadOnly: (input?: z.infer<TInput>) => boolean
  isConcurrencySafe: (input?: z.infer<TInput>) => boolean
  needsPermissions: (input?: z.infer<TInput>) => boolean
  /**
   * True when the tool requires an interactive UI round-trip with the user.
   * Default behavior: these tools should still prompt even in bypass modes.
   */
  requiresUserInteraction?: (input?: z.infer<TInput>) => boolean
  validateInput?: (
    input: z.infer<TInput>,
    context?: ToolUseContext,
  ) => Promise<ValidationResult>
  renderResultForAssistant: (output: TOutput) => string | any[]
  renderToolUseMessage: (
    input: z.infer<TInput>,
    options: { verbose: boolean },
  ) => ToolRenderOutput
  renderToolUseRejectedMessage?: (...args: any[]) => ToolRenderOutput
  renderToolResultMessage?: (
    output: TOutput,
    options: { verbose: boolean },
  ) => ToolRenderOutput
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

/**
 * Resolve tool description asynchronously.
 *
 * Many tools implement `description` as an async function (sometimes dependent on input).
 * Callers that can await should use this to avoid accidentally treating an async
 * description as a string.
 *
 * When called without `input`, this function will populate `tool.cachedDescription`
 * to enable synchronous access via `getToolDescription()` (e.g. in adapters).
 */
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

/**
 * Get tool description synchronously for adapter usage.
 * Adapter code cannot await async descriptions, so we use cached or fallback values.
 */
export function getToolDescription(tool: Tool): string {
  // First try cached description (populated by tool initialization)
  if (tool.cachedDescription) {
    return tool.cachedDescription
  }

  // Then try string description
  if (typeof tool.description === 'string') {
    return tool.description
  }

  // Finally, use fallback name if description is async function
  return `Tool: ${tool.name}`
}
