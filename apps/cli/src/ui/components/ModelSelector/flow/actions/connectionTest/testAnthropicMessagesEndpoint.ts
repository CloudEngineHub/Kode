import type { ProviderType } from '#core/utils/config'
import { debug as debugLogger } from '#core/utils/debugLogger'
import type { ConnectionTestResult } from './types'
import {
  buildCompatHeaders,
  classifyRequestFailure,
  type RequestHeadersProfile,
  type SystemPromptProfile,
  COMPAT_TOOL_ALLOWLIST,
} from '#core/ai/llm/restrictedClientCompat'
import {
  getCLISyspromptPrefix,
  getCompatSyspromptPrefix,
  getCompatSystemPrompt,
  getSystemPrompt,
} from '#core/constants/prompts'
import { randomUUID } from 'crypto'
import { mkdtemp, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { FileWriteTool } from '#tools/tools/filesystem/FileWriteTool/FileWriteTool'

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  if (Array.isArray(value)) return null
  return value as Record<string, unknown>
}

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

function extractAnthropicToolCall(data: unknown): {
  toolName: string
  args: Record<string, unknown>
} | null {
  const record = asRecord(data)
  if (!record) return null

  const content = record.content
  if (!Array.isArray(content)) return null

  const toolUse = content.find(block => asRecord(block)?.type === 'tool_use')
  const toolUseRecord = asRecord(toolUse)
  if (!toolUseRecord) return null

  const toolName =
    typeof toolUseRecord.name === 'string' ? toolUseRecord.name : null
  const args = asRecord(toolUseRecord.input)

  if (!toolName || !args) return null
  return { toolName, args }
}

function extractAnthropicTextContent(data: unknown): string {
  const record = asRecord(data)
  if (!record) return ''
  const content = record.content
  if (!Array.isArray(content)) return ''

  const texts = content
    .map(block => {
      const b = asRecord(block)
      if (!b || b.type !== 'text') return ''
      return typeof b.text === 'string' ? b.text : ''
    })
    .filter(Boolean)

  return texts.join('\n').trim()
}

async function buildSystemMessageContent(args: {
  model: string
  systemPromptProfile: SystemPromptProfile
}): Promise<string> {
  const prefix =
    args.systemPromptProfile === 'compat'
      ? getCompatSyspromptPrefix()
      : getCLISyspromptPrefix()

  const promptBlocks =
    args.systemPromptProfile === 'compat'
      ? await getCompatSystemPrompt({
          model: args.model,
          toolNames: Array.from(COMPAT_TOOL_ALLOWLIST),
        })
      : await getSystemPrompt()

  return [prefix, ...promptBlocks].join('\n')
}

export async function testAnthropicMessagesEndpoint({
  baseURL,
  selectedProvider,
  selectedModel,
  apiKey,
  maxTokens,
  requestHeadersProfile,
  systemPromptProfile,
  fallbackStepName,
  onProgress,
}: {
  baseURL: string
  selectedProvider: ProviderType
  selectedModel: string
  apiKey: string
  maxTokens: string
  requestHeadersProfile: RequestHeadersProfile
  systemPromptProfile: SystemPromptProfile
  fallbackStepName: string
  onProgress?: (result: ConnectionTestResult) => void
}): Promise<ConnectionTestResult> {
  const testURL = `${baseURL.replace(/\/+$/, '')}/v1/messages`

  const networkRetryCount = 3
  const timeoutMs = 45_000

  for (let attempt = 1; attempt <= 1 + networkRetryCount; attempt++) {
    const attemptLabel = `${attempt}/${1 + networkRetryCount}`

    onProgress?.({
      success: false,
      phase: 'request',
      attempt,
      maxAttempts: 1 + networkRetryCount,
      message: `Sending tool-use request to ${selectedProvider} /v1/messages (${attemptLabel})...`,
      endpoint: '/v1/messages',
      fallbackStep: fallbackStepName,
    })

    const tempDir = await mkdtemp(join(tmpdir(), 'kode-model-test-'))
    const expectedContent = `KODE_MODEL_TEST_OK:${randomUUID()}`
    const expectedFilePath = join(tempDir, 'write-tool-test.txt')

    try {
      const system = await buildSystemMessageContent({
        model: selectedModel,
        systemPromptProfile,
      })

      const userPrompt = `You are being tested for tool-use support.

You MUST call the Write tool exactly once with:
- file_path: ${expectedFilePath}
- content: ${expectedContent}

Do NOT include any other text. Do NOT call any other tool.`

      const tools = [
        {
          name: 'Write',
          description: 'Write a file to the local filesystem',
          input_schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              file_path: { type: 'string' },
              content: { type: 'string' },
            },
            required: ['file_path', 'content'],
          },
        },
      ]

      const testPayload: Record<string, unknown> = {
        model: selectedModel,
        system,
        messages: [{ role: 'user', content: userPrompt }],
        tools,
        tool_choice: { type: 'tool', name: 'Write' },
        max_tokens: Math.max(parseInt(maxTokens) || 1024, 256),
        temperature: 0,
        stream: false,
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': apiKey,
        ...(requestHeadersProfile === 'compat' ? buildCompatHeaders() : {}),
      }

      const response = await fetchWithTimeout(
        testURL,
        { method: 'POST', headers, body: JSON.stringify(testPayload) },
        timeoutMs,
      )

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as unknown
        const errorRecord = asRecord(errorData)
        const nestedErrorMessage = (() => {
          const nestedError = asRecord(errorRecord?.error)
          const nestedMessage = nestedError?.message
          return typeof nestedMessage === 'string' ? nestedMessage : null
        })()
        const errorMessage =
          nestedErrorMessage ||
          (typeof errorRecord?.message === 'string'
            ? errorRecord.message
            : null) ||
          response.statusText ||
          `HTTP ${response.status}`

        const syntheticError = Object.assign(new Error(errorMessage), {
          status: response.status,
        })
        const classified = classifyRequestFailure(syntheticError, {
          modelName: selectedModel,
        })
        const errorCategory =
          response.status >= 500
            ? 'network'
            : classified.kind === 'restricted_client_only'
              ? 'restricted_client_only'
              : classified.kind

        const result: ConnectionTestResult = {
          success: false,
          message: `${selectedProvider} failed (${response.status})`,
          endpoint: '/v1/messages',
          details: `Error: ${errorMessage}`,
          errorCategory,
          fallbackStep: fallbackStepName,
        }

        if (errorCategory === 'network' && attempt <= networkRetryCount) {
          const retryInMs = attempt * 5000
          onProgress?.({
            ...result,
            phase: 'retry_wait',
            attempt,
            maxAttempts: 1 + networkRetryCount,
            retryInMs,
            message: `${result.message} — retrying in ${Math.round(retryInMs / 1000)}s...`,
          })
          await sleep(retryInMs)
          continue
        }

        return result
      }

      const data = (await response.json()) as unknown
      debugLogger.api('CONNECTION_TEST_RESPONSE', {
        provider: selectedProvider,
        endpoint: '/v1/messages',
        ok: true,
      })

      const toolCall = extractAnthropicToolCall(data)
      if (!toolCall) {
        const responseContent = extractAnthropicTextContent(data).trim()
        return {
          success: false,
          message: `${selectedProvider} connected but tool-use verification failed`,
          endpoint: '/v1/messages',
          errorCategory: 'tool_use_unsupported',
          fallbackStep: fallbackStepName,
          details:
            responseContent.length > 0
              ? `Model did not call the Write tool. Response: "${responseContent}"\n\nThis usually means the model/provider does not support tool use reliably. Try a newer/stronger model (e.g. glm4.7, minimax2.1, claude sonnet 4.5) or change request strategy.`
              : 'Model did not call the Write tool and returned an empty response.\n\nThis usually means the model/provider does not support tool use reliably. Try a newer/stronger model (e.g. glm4.7, minimax2.1, claude sonnet 4.5) or change request strategy.',
        }
      }

      if (toolCall.toolName !== 'Write') {
        return {
          success: false,
          message: `${selectedProvider} returned unexpected tool call`,
          endpoint: '/v1/messages',
          errorCategory: 'unexpected_tool_call',
          fallbackStep: fallbackStepName,
          details: `Expected tool "Write" but got "${toolCall.toolName}"`,
        }
      }

      const filePath = toolCall.args.file_path
      const content = toolCall.args.content
      if (typeof filePath !== 'string' || typeof content !== 'string') {
        return {
          success: false,
          message: `${selectedProvider} tool call arguments invalid`,
          endpoint: '/v1/messages',
          errorCategory: 'invalid_tool_args',
          fallbackStep: fallbackStepName,
          details: `Expected {file_path: string, content: string} but got: ${JSON.stringify(toolCall.args)}`,
        }
      }

      if (filePath !== expectedFilePath || content !== expectedContent) {
        return {
          success: false,
          message: `${selectedProvider} tool call arguments mismatch`,
          endpoint: '/v1/messages',
          errorCategory: 'invalid_tool_args',
          fallbackStep: fallbackStepName,
          details: `Expected file_path="${expectedFilePath}" and exact content match, but got file_path="${filePath}" content="${content}"`,
        }
      }

      // Execute the requested tool call locally via the actual Write tool implementation.
      const writeContext = {
        messageId: 'model-connection-test',
        abortController: new AbortController(),
        readFileTimestamps: {} as Record<string, number>,
      } as const

      const writeGen = FileWriteTool.call(
        { file_path: expectedFilePath, content: expectedContent },
        writeContext as any,
      )
      for await (const step of writeGen) {
        if (step.type === 'result') break
      }
      const actual = await readFile(expectedFilePath, 'utf8')
      if (actual !== expectedContent) {
        return {
          success: false,
          message: `${selectedProvider} local file verification failed`,
          endpoint: '/v1/messages',
          errorCategory: 'local_verification_failed',
          fallbackStep: fallbackStepName,
          details: `File content mismatch after write; expected "${expectedContent}" but got "${actual}"`,
        }
      }

      return {
        success: true,
        message: `Tool-use connection test passed with ${selectedProvider}`,
        endpoint: '/v1/messages',
        fallbackStep: fallbackStepName,
        details: `Model successfully called Write and the file was verified: ${expectedFilePath}`,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const classified = classifyRequestFailure(error, {
        modelName: selectedModel,
      })
      const errorCategory = message.toLowerCase().includes('abort')
        ? 'timeout'
        : classified.kind

      const result: ConnectionTestResult = {
        success: false,
        message: `${selectedProvider} connection failed`,
        endpoint: '/v1/messages',
        details: message,
        errorCategory,
        fallbackStep: fallbackStepName,
      }

      if (
        (errorCategory === 'network' || errorCategory === 'timeout') &&
        attempt <= networkRetryCount
      ) {
        const retryInMs = attempt * 5000
        onProgress?.({
          ...result,
          phase: 'retry_wait',
          attempt,
          maxAttempts: 1 + networkRetryCount,
          retryInMs,
          message: `${result.message} — retrying in ${Math.round(retryInMs / 1000)}s...`,
        })
        await sleep(retryInMs)
        continue
      }

      return result
    } finally {
      try {
        await rm(tempDir, { recursive: true, force: true })
      } catch {
        // ignore
      }
    }
  }

  return {
    success: false,
    message: `${selectedProvider} connection failed`,
    endpoint: '/v1/messages',
    details: 'Exhausted retries',
    errorCategory: 'network',
    fallbackStep: fallbackStepName,
  }
}
