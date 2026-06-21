import { Box, Text } from 'ink'
import React from 'react'
import { z } from 'zod'
import { Tool, ToolUseContext } from '#core/tooling/Tool'
import type { AssistantMessage, UserMessage } from '#core/query'
import { queryLLM } from '#core/ai/llmLazy'
import { randomUUID } from 'crypto'
import { isIP } from 'node:net'
import { PROMPT, TOOL_NAME_FOR_PROMPT } from './prompt'
import { convertHtmlToMarkdown } from './htmlToMarkdown'
import { urlCache } from './cache'
import {
  buildWebFetchApplyPrompt,
  createTimeoutSignal,
  extractTextFromMessageContent,
  fetchWithRedirectDetection,
  formatBytes,
  isMarkdownHost,
  normalizeUrl,
  readResponseTextLimited,
  truncateFetchedContent,
} from './utils'

const inputSchema = z.object({
  url: z.string().describe('The URL to fetch content from'),
  prompt: z.string().describe('The prompt to run on the fetched content'),
})

type Input = z.infer<typeof inputSchema>
type Output = {
  bytes: number
  code: number
  codeText: string
  result: string
  durationMs: number
  url: string
}

const FETCH_TIMEOUT_MS = 30_000
const MAX_URL_LENGTH = 2000
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024 // 10485760

function isPrivateIpv4(hostname: string): boolean {
  if (isIP(hostname) !== 4) return false
  const parts = hostname.split('.').map(Number)
  if (parts.length !== 4) return false
  if (parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false
  }
  const [a, b] = parts
  if (a === 0) return true
  if (a === 10) return true
  if (a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  return false
}

function isValidWebFetchUrl(url: string): boolean {
  if (url.length > MAX_URL_LENGTH) return false
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
  if (parsed.username || parsed.password) return false
  if (isPrivateIpv4(parsed.hostname)) return false
  if (parsed.hostname.split('.').length < 2) return false
  return true
}

export const WebFetchTool = {
  name: TOOL_NAME_FOR_PROMPT,
  async description(input?: Input) {
    const url = input?.url
    try {
      return `The assistant wants to fetch content from ${new URL(url || '').hostname}`
    } catch {
      return 'The assistant wants to fetch content from this URL'
    }
  },
  userFacingName: () => 'Fetch',
  inputSchema,
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  async isEnabled() {
    return true
  },
  needsPermissions() {
    return true
  },
  async prompt() {
    return PROMPT
  },
  async validateInput({ url }: Input) {
    try {
      new URL(url)
    } catch {
      return {
        result: false,
        message: `Error: Invalid URL "${url}". The URL provided could not be parsed.`,
        meta: { reason: 'invalid_url' },
        errorCode: 1,
      }
    }
    return { result: true }
  },
  renderToolUseMessage(
    { url, prompt }: Input,
    { verbose }: { verbose: boolean },
  ) {
    if (verbose) {
      return `url: "${url}"${prompt ? `, prompt: "${prompt}"` : ''}`
    }
    return url
  },
  renderToolResultMessage(output: Output) {
    return (
      <Box flexDirection="row">
        <Text>&nbsp;&nbsp;⎿ &nbsp;Received </Text>
        <Text bold>{formatBytes(output.bytes)} </Text>
        <Text>
          ({output.code} {output.codeText})
        </Text>
      </Box>
    )
  },
  renderResultForAssistant(output: Output) {
    return output.result
  },
  async *call({ url, prompt }: Input, context: ToolUseContext) {
    const normalizedUrl = normalizeUrl(url)
    const start = Date.now()

    const timeoutSignal = createTimeoutSignal(
      context.abortController.signal,
      FETCH_TIMEOUT_MS,
    )

    try {
      if (!isValidWebFetchUrl(normalizedUrl)) {
        throw new Error('Invalid URL')
      }

      const cached = urlCache.get(normalizedUrl)

      const fetched = cached
        ? null
        : await fetchWithRedirectDetection(normalizedUrl, timeoutSignal.signal)

      if (fetched && fetched.type === 'redirect') {
        const codeText =
          fetched.statusCode === 301
            ? 'Moved Permanently'
            : fetched.statusCode === 308
              ? 'Permanent Redirect'
              : fetched.statusCode === 307
                ? 'Temporary Redirect'
                : 'Found'

        const result = `REDIRECT DETECTED: The URL redirects to a different host.

Original URL: ${fetched.originalUrl}
Redirect URL: ${fetched.redirectUrl}
Status: ${fetched.statusCode} ${codeText}

To complete your request, I need to fetch content from the redirected URL. Please use WebFetch again with these parameters:
- url: "${fetched.redirectUrl}"
- prompt: "${prompt}"`

        const output: Output = {
          bytes: Buffer.byteLength(result, 'utf8'),
          code: fetched.statusCode,
          codeText,
          result,
          durationMs: Date.now() - start,
          url: normalizedUrl,
        }
        yield {
          type: 'result' as const,
          resultForAssistant: this.renderResultForAssistant(output),
          data: output,
        }
        return
      }

      let bytes = cached ? cached.bytes : 0
      let code = cached ? cached.code : 200
      let codeText = cached ? cached.codeText : 'OK'
      let markdown = cached ? cached.content : ''
      let contentType = cached ? cached.contentType : ''

      if (fetched && fetched.type === 'response') {
        const response = fetched.response

        code = response.status
        codeText = response.statusText || 'OK'

        contentType = response.headers.get('content-type') || ''

        const { text: raw, bytes: responseBytes } =
          await readResponseTextLimited(response, MAX_RESPONSE_BYTES)
        bytes = responseBytes

        const converted = contentType.toLowerCase().includes('text/html')
          ? convertHtmlToMarkdown(raw)
          : raw
        markdown = truncateFetchedContent(converted)
        urlCache.set(normalizedUrl, {
          bytes,
          code,
          codeText,
          content: markdown,
          contentType,
        })
      }

      const allowBroaderQuoting = isMarkdownHost(normalizedUrl, contentType)
      const userPrompt = buildWebFetchApplyPrompt(
        markdown,
        prompt,
        allowBroaderQuoting,
      )
      const messages = [
        {
          type: 'user',
          uuid: randomUUID(),
          message: { role: 'user', content: userPrompt },
        },
      ] as (UserMessage | AssistantMessage)[]

      const aiResponse = await queryLLM(
        messages,
        [],
        0,
        [],
        timeoutSignal.signal,
        {
          safeMode: false,
          model: 'main',
          prependCLISysprompt: false,
          temperature: 0,
          maxTokens: 2048,
        },
      )

      const extracted = extractTextFromMessageContent(
        aiResponse.message.content as unknown,
      )
      const result = extracted ?? 'No response from model'

      const output: Output = {
        bytes,
        code,
        codeText,
        result,
        durationMs: Date.now() - start,
        url: normalizedUrl,
      }

      yield {
        type: 'result' as const,
        resultForAssistant: this.renderResultForAssistant(output),
        data: output,
      }
    } finally {
      timeoutSignal.cleanup()
    }
  },
} satisfies Tool<typeof inputSchema, Output>
