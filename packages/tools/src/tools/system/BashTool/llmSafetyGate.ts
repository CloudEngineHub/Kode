import { logError } from '#core/utils/log'
import { createUserMessage } from '#core/utils/messages'
import type { CommandSource } from './commandSource'
import {
  getBashGateFindings,
  shouldReviewBashCommand,
  type BashGateFinding,
} from './bashGateRules'
import { writeGateFailureDump } from './llmSafetyGateDump'
import {
  buildGateSystemPrompt,
  buildGateUserInput,
} from './llmSafetyGatePrompt'
import {
  parseVerdictFromText,
  type BashLlmGateVerdict,
} from './llmSafetyGateVerdict'
export {
  formatBashLlmGateBlockMessage,
  type BashLlmGateVerdict,
} from './llmSafetyGateVerdict'

// Gate calls must be fast in the common case, but some reasoning models can be slow.
// Keep this generous enough to avoid spurious timeouts, while still bounded.
const DEFAULT_GATE_TIMEOUT_MS = 300_000
const DEFAULT_GATE_STOP_SEQUENCES = ['</final>']

export type BashLlmGateErrorType =
  | 'api'
  | 'timeout'
  | 'invalid_output'
  | 'unknown'

type GateQueryFn = (args: {
  systemPrompt: string[]
  userInput: string
  signal: AbortSignal
  model?: 'quick' | 'main'
}) => Promise<string>

type LlmModuleLoader = () => Promise<{
  API_ERROR_MESSAGE_PREFIX: string
  queryLLM: (args: any) => Promise<any>
}>

let llmModuleLoader: LlmModuleLoader | null = null

export function __setLlmModuleLoaderForTests(
  loader: LlmModuleLoader | null,
): void {
  llmModuleLoader = loader
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

function collectTextBlocks(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .flatMap(block => {
      const record = asRecord(block)
      if (!record) return []
      if (record.type === 'text' && typeof record.text === 'string')
        return [record.text]
      if (record.type === 'thinking' && typeof record.thinking === 'string')
        return [record.thinking]
      // Some providers return plain objects without `type`; tolerate those.
      if (
        (record.type === undefined || record.type === null) &&
        typeof record.text === 'string'
      )
        return [record.text]
      if (
        (record.type === undefined || record.type === null) &&
        typeof record.thinking === 'string'
      )
        return [record.thinking]
      return []
    })
    .join('\n')
}

function formatParseError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function defaultGateQuery(args: {
  systemPrompt: string[]
  userInput: string
  signal: AbortSignal
  model?: 'quick' | 'main'
}): Promise<string> {
  const { API_ERROR_MESSAGE_PREFIX, queryLLM } = llmModuleLoader
    ? await llmModuleLoader()
    : await import('#core/ai/llm')
  const messages = [createUserMessage(args.userInput)]

  // Use the normal model-pointer config but *without* the CLI sysprompt.
  // The gate needs a single, purpose-built system prompt to stay deterministic.
  const assistant = await queryLLM(
    messages,
    args.systemPrompt,
    0,
    [],
    args.signal,
    {
      safeMode: false,
      model: args.model ?? 'quick',
      prependCLISysprompt: false,
      stopSequences: DEFAULT_GATE_STOP_SEQUENCES,
    },
  )

  const text = collectTextBlocks(assistant.message.content as unknown)
  const trimmed = text.trim()
  if (assistant.isApiErrorMessage) {
    const preview = trimmed.length > 240 ? `${trimmed.slice(0, 240)}…` : trimmed
    throw new Error(`LLM gate model error: ${preview}`)
  }
  if (trimmed.startsWith(API_ERROR_MESSAGE_PREFIX)) {
    const preview = trimmed.length > 240 ? `${trimmed.slice(0, 240)}…` : trimmed
    throw new Error(`LLM gate model error: ${preview}`)
  }
  return text
}

type GateAttemptOutput = {
  model: 'quick' | 'main'
  output: string
  error?: string
}

export async function runBashLlmSafetyGate(params: {
  command: string
  userPrompt: string
  description: string
  platform: NodeJS.Platform
  commandSource: CommandSource
  safeMode: boolean
  runInBackground: boolean
  willSandbox: boolean
  sandboxRequired: boolean
  cwd: string
  originalCwd: string
  parentAbortSignal?: AbortSignal
  query?: GateQueryFn
}): Promise<
  | { decision: 'allow'; verdict: BashLlmGateVerdict; fromCache: boolean }
  | { decision: 'block'; verdict: BashLlmGateVerdict; fromCache: boolean }
  | {
      decision: 'error'
      error: string
      errorType: BashLlmGateErrorType
      willSandbox: boolean
      canFailOpen: boolean
    }
  | { decision: 'disabled' }
> {
  const trimmedUserPrompt = params.userPrompt.trim()
  const trimmedDescription = params.description.trim()
  const findings = getBashGateFindings(params.command)
  const attemptOutputs: GateAttemptOutput[] = []

  // Only run the LLM gate when unified policy says review is needed.
  if (!shouldReviewBashCommand(findings)) {
    return {
      decision: 'allow',
      verdict: { action: 'allow', summary: '' },
      fromCache: false,
    }
  }

  const abortController = new AbortController()
  const timeout = setTimeout(
    () => abortController.abort(),
    DEFAULT_GATE_TIMEOUT_MS,
  )
  const onAbort = () => abortController.abort()
  params.parentAbortSignal?.addEventListener('abort', onAbort, { once: true })

  try {
    const baseInput = buildGateUserInput({
      command: params.command,
      userPrompt: trimmedUserPrompt,
      description: trimmedDescription,
      findings,
      platform: params.platform,
      commandSource: params.commandSource,
      safeMode: params.safeMode,
      runInBackground: params.runInBackground,
      willSandbox: params.willSandbox,
      sandboxRequired: params.sandboxRequired,
      cwd: params.cwd,
      originalCwd: params.originalCwd,
    })
    const query = params.query ?? defaultGateQuery
    const attempts: Array<{ model: 'quick' | 'main' }> = [
      { model: 'quick' },
      { model: 'main' },
      { model: 'main' },
    ]

    let lastError: unknown = null
    for (const attempt of attempts) {
      try {
        const output = await query({
          systemPrompt: buildGateSystemPrompt(),
          userInput: baseInput,
          signal: abortController.signal,
          model: attempt.model,
        })
        attemptOutputs.push({ model: attempt.model, output })
        const verdict = parseVerdictFromText(output)
        return {
          decision: verdict.action === 'allow' ? 'allow' : 'block',
          verdict,
          fromCache: false,
        }
      } catch (e) {
        lastError = e
        attemptOutputs.push({
          model: attempt.model,
          output: '',
          error: formatParseError(e),
        })
      }
    }
    throw lastError ?? new Error('LLM gate produced no verdict')
  } catch (error) {
    const errorStr = formatParseError(error)
    const errorType: BashLlmGateErrorType = abortController.signal.aborted
      ? 'timeout'
      : errorStr.startsWith('LLM gate model error:')
        ? 'api'
        : errorStr.startsWith('LLM gate produced empty output') ||
            errorStr.startsWith('Unable to parse LLM gate verdict')
          ? 'invalid_output'
          : 'unknown'
    logError(`Bash LLM gate error: ${errorStr}`)
    const input = buildGateUserInput({
      command: params.command,
      userPrompt: trimmedUserPrompt,
      description: trimmedDescription,
      findings,
      platform: params.platform,
      commandSource: params.commandSource,
      safeMode: params.safeMode,
      runInBackground: params.runInBackground,
      willSandbox: params.willSandbox,
      sandboxRequired: params.sandboxRequired,
      cwd: params.cwd,
      originalCwd: params.originalCwd,
    })
    const output =
      attemptOutputs.length > 0
        ? attemptOutputs
            .map(o => {
              const header = `--- model: ${o.model} ---`
              const body = o.error ? `error: ${o.error}` : o.output
              return `${header}\n${body}`
            })
            .join('\n\n')
        : undefined
    writeGateFailureDump({
      command: params.command,
      userPrompt: trimmedUserPrompt,
      description: trimmedDescription,
      findings,
      input,
      ...(output ? { output } : {}),
      error: errorStr,
      errorType,
    })
    return {
      decision: 'error',
      error: errorStr,
      errorType,
      willSandbox: params.willSandbox,
      canFailOpen: false,
    }
  } finally {
    clearTimeout(timeout)
    params.parentAbortSignal?.removeEventListener('abort', onAbort)
  }
}
