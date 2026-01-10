import type { Tool } from '#core/tooling/Tool'
import type { ClaudeCodeRequestStrategy } from '#config'

export type RequestHeadersProfile = 'kode' | 'claude_code'
export type SystemPromptProfile = 'kode' | 'claude_code'
export type ToolProfile = 'kode' | 'claude_code'

export type ClaudeCodeFallbackStep = {
  name: string
  headers: RequestHeadersProfile
  systemPrompt: SystemPromptProfile
  tools: ToolProfile
}

// Compatibility UA version for restricted-client providers.
const CLAUDE_CODE_VERSION = '2.1.2'
export const CLAUDE_CODE_DEFAULT_TIMEOUT_MS = 600000

export const CLAUDE_CODE_TOOL_ALLOWLIST = new Set<string>([
  'Task',
  'Bash',
  'TaskOutput',
  'KillShell',
  'LS',
  'Glob',
  'Grep',
  'Read',
  'Edit',
  'Write',
  'NotebookEdit',
  'TodoWrite',
  'WebSearch',
  'WebFetch',
  'AskUserQuestion',
  'EnterPlanMode',
  'ExitPlanMode',
  'LSP',
  'ListMcpResourcesTool',
  'ReadMcpResourceTool',
  'mcp',
  'MCPSearch',
])

const CLAUDE_ONLY_ERROR_HINTS = [
  'claude code',
  'claude-code',
  'claude_code',
  'claude cli',
  'claude-cli',
  'official cli',
  'only for claude',
  'only allowed for claude',
  'claude-only',
]

const AUTH_ERROR_HINTS = [
  'invalid api key',
  'incorrect api key',
  'x-api-key',
  'api key',
  'unauthorized',
  'authentication',
]

const BILLING_ERROR_HINTS = [
  'insufficient',
  'balance',
  'billing',
  'quota',
  'payment required',
  'credit',
]

const NETWORK_ERROR_HINTS = [
  'timeout',
  'timed out',
  'network',
  'econn',
  'enotfound',
  'eai_again',
  'socket hang up',
  'connection refused',
]

type RequestFailureKind =
  | 'claude_code_only'
  | 'auth'
  | 'billing'
  | 'network'
  | 'other'

function extractStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined
  const record = error as Record<string, unknown>
  if (typeof record.status === 'number') return record.status
  const response = record.response as Record<string, unknown> | undefined
  if (response && typeof response.status === 'number') return response.status
  return undefined
}

function extractMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

function extractHintText(error: unknown): string {
  const message = extractMessage(error)
  const parts: string[] = [message]

  if (!error || typeof error !== 'object') return message
  const record = error as Record<string, unknown>

  const pushIfString = (value: unknown) => {
    if (typeof value !== 'string') return
    const trimmed = value.trim()
    if (!trimmed) return
    parts.push(trimmed)
  }

  pushIfString(record.name)
  pushIfString(record.code)
  pushIfString(record.type)

  const nestedError =
    record.error &&
    typeof record.error === 'object' &&
    !Array.isArray(record.error)
      ? (record.error as Record<string, unknown>)
      : null

  if (nestedError) {
    pushIfString(nestedError.name)
    pushIfString(nestedError.code)
    pushIfString(nestedError.type)
    pushIfString(nestedError.message)
  }

  const response =
    record.response &&
    typeof record.response === 'object' &&
    !Array.isArray(record.response)
      ? (record.response as Record<string, unknown>)
      : null

  if (response) {
    pushIfString(response.statusText)

    const responseData =
      response.data &&
      typeof response.data === 'object' &&
      !Array.isArray(response.data)
        ? (response.data as Record<string, unknown>)
        : null

    if (responseData) {
      pushIfString(responseData.message)
      const responseNested =
        responseData.error &&
        typeof responseData.error === 'object' &&
        !Array.isArray(responseData.error)
          ? (responseData.error as Record<string, unknown>)
          : null
      if (responseNested) {
        pushIfString(responseNested.type)
        pushIfString(responseNested.code)
        pushIfString(responseNested.message)
      }
    }
  }

  return parts.join('\n')
}

function hasAnyHint(message: string, hints: string[]): boolean {
  const normalized = message.toLowerCase()
  return hints.some(hint => normalized.includes(hint))
}

export function classifyRequestFailure(
  error: unknown,
  options?: { modelName?: string },
): {
  kind: RequestFailureKind
  message: string
  status?: number
} {
  const message = extractMessage(error)
  const hintText = extractHintText(error)
  const status = extractStatus(error)
  const modelName = options?.modelName
  const isClaudeModel =
    typeof modelName === 'string' && isClaudeModelName(modelName)

  if (hasAnyHint(hintText, CLAUDE_ONLY_ERROR_HINTS)) {
    return { kind: 'claude_code_only', message, status }
  }

  if (hasAnyHint(hintText, NETWORK_ERROR_HINTS)) {
    return { kind: 'network', message, status }
  }

  if (status === 401 || status === 403) {
    if (hasAnyHint(hintText, AUTH_ERROR_HINTS)) {
      return { kind: 'auth', message, status }
    }
  }

  if (status === 402 || hasAnyHint(hintText, BILLING_ERROR_HINTS)) {
    return { kind: 'billing', message, status }
  }

  if (hasAnyHint(hintText, AUTH_ERROR_HINTS)) {
    return { kind: 'auth', message, status }
  }

  // Some Anthropic-compatible gateways return a generic 403 for requests that must
  // match a specific client fingerprint (UA/headers/prompt/tools). Only treat this as
  // a "restricted client" signal when the user is configuring or running a Claude model.
  if (status === 403 && isClaudeModel) {
    return { kind: 'claude_code_only', message, status }
  }

  return { kind: 'other', message, status }
}

export function shouldAttemptClaudeCodeFallback(
  error: unknown,
  modelName?: string,
): boolean {
  return (
    classifyRequestFailure(error, { modelName }).kind === 'claude_code_only'
  )
}

export function isClaudeModelName(modelName: string): boolean {
  return modelName.toLowerCase().includes('claude')
}

export function buildClaudeCodeUserAgent(): string {
  // Compatibility UA builder. We mirror the default behavior ("cli" for TTY,
  // "sdk-cli" otherwise) to avoid emitting "undefined" in the UA.
  const entrypoint =
    process.env.CLAUDE_CODE_ENTRYPOINT ??
    (process.stdout.isTTY ? 'cli' : 'sdk-cli')

  const agentSdk = process.env.CLAUDE_AGENT_SDK_VERSION
    ? `, agent-sdk/${process.env.CLAUDE_AGENT_SDK_VERSION}`
    : ''

  return `claude-cli/${CLAUDE_CODE_VERSION} (external, ${entrypoint}${agentSdk})`
}

function parseAnthropicCustomHeaders(): Record<string, string> {
  const raw = process.env.ANTHROPIC_CUSTOM_HEADERS
  if (!raw) return {}
  const out: Record<string, string> = {}
  const lines = raw.split(/\n|\r\n/)
  for (const line of lines) {
    if (!line.trim()) continue
    const match = line.match(/^\s*(.*?)\s*:\s*(.*?)\s*$/)
    if (!match) continue
    const [, key, value] = match
    if (key && value !== undefined) {
      out[key] = value
    }
  }
  return out
}

function isTruthyEnvVar(value: string | undefined): boolean {
  if (!value) return false
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

export function buildClaudeCodeHeaders(options?: {
  includeAuthToken?: boolean
}): Record<string, string> {
  const headers: Record<string, string> = {
    'x-app': 'cli',
    'User-Agent': buildClaudeCodeUserAgent(),
    ...parseAnthropicCustomHeaders(),
  }

  const shouldIncludeAuthToken = options?.includeAuthToken !== false
  if (shouldIncludeAuthToken && process.env.ANTHROPIC_AUTH_TOKEN) {
    // Add Authorization when ANTHROPIC_AUTH_TOKEN is available (some gateways check it).
    headers.Authorization = `Bearer ${process.env.ANTHROPIC_AUTH_TOKEN}`
  }

  if (process.env.CLAUDE_CODE_CONTAINER_ID) {
    headers['x-claude-remote-container-id'] =
      process.env.CLAUDE_CODE_CONTAINER_ID
  }
  if (process.env.CLAUDE_CODE_REMOTE_SESSION_ID) {
    headers['x-claude-remote-session-id'] =
      process.env.CLAUDE_CODE_REMOTE_SESSION_ID
  }
  if (isTruthyEnvVar(process.env.CLAUDE_CODE_ADDITIONAL_PROTECTION)) {
    headers['x-anthropic-additional-protection'] = 'true'
  }

  return headers
}

export function buildClaudeCodeFallbackPlan(
  strategy: ClaudeCodeRequestStrategy | undefined,
  modelName: string,
): ClaudeCodeFallbackStep[] {
  const resolved = strategy ?? 'auto'

  if (resolved === 'kode') {
    return [
      {
        name: 'kode-default',
        headers: 'kode',
        systemPrompt: 'kode',
        tools: 'kode',
      },
    ]
  }

  if (resolved === 'claude_code_headers') {
    return [
      {
        name: 'compat-headers',
        headers: 'claude_code',
        systemPrompt: 'kode',
        tools: 'kode',
      },
    ]
  }

  if (resolved === 'claude_code_headers_system') {
    return [
      {
        name: 'compat-headers-system',
        headers: 'claude_code',
        systemPrompt: 'claude_code',
        tools: 'kode',
      },
    ]
  }

  if (resolved === 'claude_code_full') {
    return [
      {
        name: 'compat-full',
        headers: 'claude_code',
        systemPrompt: 'claude_code',
        tools: 'claude_code',
      },
    ]
  }

  if (!isClaudeModelName(modelName)) {
    return [
      {
        name: 'kode-default',
        headers: 'kode',
        systemPrompt: 'kode',
        tools: 'kode',
      },
    ]
  }

  return [
    {
      name: 'kode-default',
      headers: 'kode',
      systemPrompt: 'kode',
      tools: 'kode',
    },
    {
      name: 'compat-headers',
      headers: 'claude_code',
      systemPrompt: 'kode',
      tools: 'kode',
    },
    {
      name: 'compat-headers-system',
      headers: 'claude_code',
      systemPrompt: 'claude_code',
      tools: 'kode',
    },
    {
      name: 'compat-full',
      headers: 'claude_code',
      systemPrompt: 'claude_code',
      tools: 'claude_code',
    },
  ]
}

export function filterToolsForClaudeCode(tools: Tool[]): Tool[] {
  return tools.filter(tool => {
    if (CLAUDE_CODE_TOOL_ALLOWLIST.has(tool.name)) return true
    // Keep MCP dynamically-mounted tools even in "baseline tools only" mode.
    if (tool.name.startsWith('mcp__')) return true
    return false
  })
}
