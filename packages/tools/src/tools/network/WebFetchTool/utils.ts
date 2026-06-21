const MAX_CONTENT_CHARS = 100_000

type TextContentBlock = { type: 'text'; text: string }

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

function isTextContentBlock(block: unknown): block is TextContentBlock {
  const record = asRecord(block)
  if (!record) return false
  return record.type === 'text' && typeof record.text === 'string'
}

export function extractTextFromMessageContent(content: unknown): string | null {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return null
  const textBlock = content.find(isTextContentBlock)
  return textBlock ? textBlock.text : null
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return `${bytes}B`
  if (bytes < 1024) return `${Math.max(0, Math.round(bytes))}B`
  const units = ['KB', 'MB', 'GB', 'TB'] as const
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex++
  }
  const rounded = Math.round(value * 10) / 10
  return `${rounded}${units[unitIndex]}`
}

export function normalizeUrl(url: string): string {
  if (url.startsWith('http://')) {
    return url.replace('http://', 'https://')
  }
  return url
}

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^www\./i, '').toLowerCase()
}

function isSameHost(originalUrl: string, redirectUrl: string): boolean {
  try {
    const original = new URL(originalUrl)
    const redirect = new URL(redirectUrl)
    if (redirect.protocol !== original.protocol) return false
    if (redirect.port !== original.port) return false
    if (redirect.username || redirect.password) return false
    return (
      normalizeHostname(original.hostname) ===
      normalizeHostname(redirect.hostname)
    )
  } catch {
    return false
  }
}

export function createTimeoutSignal(
  parent: AbortSignal,
  timeoutMs: number,
): {
  signal: AbortSignal
  cleanup: () => void
} {
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  if (parent.aborted) {
    controller.abort()
  } else {
    parent.addEventListener('abort', onAbort, { once: true })
  }
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout)
      parent.removeEventListener('abort', onAbort)
    },
  }
}

export async function readResponseTextLimited(
  response: Response,
  maxBytes: number,
): Promise<{ text: string; bytes: number }> {
  if (!response.body) return { text: '', bytes: 0 }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (!value) continue
      bytes += value.byteLength
      if (bytes > maxBytes) {
        try {
          await reader.cancel()
        } catch {
          // ignore
        }
        throw new Error(
          `Response exceeded maximum allowed size (${maxBytes} bytes)`,
        )
      }
      chunks.push(value)
    }
  } finally {
    try {
      reader.releaseLock()
    } catch {
      // ignore
    }
  }

  const buffer = Buffer.concat(chunks.map(chunk => Buffer.from(chunk)))
  return { text: buffer.toString('utf-8'), bytes }
}

export function truncateFetchedContent(content: string): string {
  if (content.length <= MAX_CONTENT_CHARS) return content
  return `${content.substring(0, MAX_CONTENT_CHARS)}...[content truncated]`
}

export function isMarkdownHost(url: string, contentType: string): boolean {
  const lowerContentType = contentType.toLowerCase()
  if (lowerContentType.includes('text/markdown')) return true
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()
    if (
      host === 'raw.githubusercontent.com' ||
      host === 'gist.githubusercontent.com' ||
      host === 'modelcontextprotocol.io' ||
      host === 'github.com'
    ) {
      return true
    }
    const pathname = parsed.pathname.toLowerCase()
    return pathname.endsWith('.md') || pathname.endsWith('.markdown')
  } catch {
    return false
  }
}

export function buildWebFetchApplyPrompt(
  content: string,
  prompt: string,
  allowBroaderQuoting: boolean,
): string {
  return `
Web page content:
---
${content}
---

${prompt}

${
  allowBroaderQuoting
    ? 'Provide a concise response based on the content above. Include relevant details, code examples, and documentation excerpts as needed.'
    : `Provide a concise response based only on the content above. In your response:
 - Enforce a strict 125-character maximum for quotes from any source document. Open Source Software is ok as long as we respect the license.
 - Use quotation marks for exact language from articles; any language outside of the quotation should never be word-for-word the same.
 - You are not a lawyer and never comment on the legality of your own prompts and responses.
 - Never produce or reproduce exact song lyrics.`
}
`
}

function getChromeLikeHeaders(): Record<string, string> {
  const platformHint =
    process.platform === 'darwin'
      ? 'macOS'
      : process.platform === 'win32'
        ? 'Windows'
        : 'Linux'
  const userAgent =
    process.platform === 'darwin'
      ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
      : process.platform === 'win32'
        ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
        : 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'

  return {
    'User-Agent': userAgent,
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'sec-ch-ua':
      '"Chromium";v="121", "Not A(Brand";v="99", "Google Chrome";v="121"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': `"${platformHint}"`,
  }
}

export async function fetchWithRedirectDetection(
  url: string,
  signal: AbortSignal,
): Promise<
  | {
      type: 'redirect'
      originalUrl: string
      redirectUrl: string
      statusCode: number
    }
  | { type: 'response'; response: Response; finalUrl: string }
> {
  let current = url
  const headers = getChromeLikeHeaders()
  for (let i = 0; i < 10; i++) {
    const response = await fetch(current, {
      method: 'GET',
      headers,
      signal,
      redirect: 'manual',
    })

    if ([301, 302, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      if (!location) {
        return { type: 'response', response, finalUrl: current }
      }
      const redirectUrl = new URL(location, current).toString()
      if (isSameHost(current, redirectUrl)) {
        current = redirectUrl
        continue
      }
      return {
        type: 'redirect',
        originalUrl: url,
        redirectUrl,
        statusCode: response.status,
      }
    }

    return { type: 'response', response, finalUrl: current }
  }

  const response = await fetch(current, {
    method: 'GET',
    headers,
    signal,
    redirect: 'manual',
  })
  return { type: 'response', response, finalUrl: current }
}
