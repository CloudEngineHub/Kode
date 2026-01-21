type BlockRecord = Record<string, unknown>

export type TranscriptTextOptions = {
  includeTools: boolean
  collapseToolBlocks?: boolean
  maxCollapsedChars?: number
}

export type TranscriptMessage = {
  type: string
  message?: { content?: unknown } | null
}

function coerceBlockText(block: unknown): string {
  if (!block || typeof block !== 'object') return ''
  const record = block as BlockRecord
  if (record.type !== 'text') return ''
  return String(record.text ?? '')
}

function coerceBlockType(block: unknown): string {
  if (!block || typeof block !== 'object') return ''
  const record = block as BlockRecord
  return typeof record.type === 'string' ? record.type : ''
}

function stringifyForTranscript(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function truncateMiddle(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  if (maxChars <= 0) return ''

  const ellipsis = '...'
  if (maxChars <= ellipsis.length) {
    return ellipsis.slice(0, maxChars)
  }

  const available = maxChars - ellipsis.length
  const head = Math.ceil(available * 0.6)
  const tail = Math.max(0, available - head)
  return `${text.slice(0, head)}${ellipsis}${tail ? text.slice(text.length - tail) : ''}`
}

function formatToolResultContent(raw: unknown): string {
  if (typeof raw === 'string') return raw
  if (!Array.isArray(raw)) return stringifyForTranscript(raw)
  const text = raw.map(coerceBlockText).filter(Boolean).join('')
  return text || stringifyForTranscript(raw)
}

export function extractTextFromMessageContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  return content
    .filter(block => block && typeof block === 'object')
    .map(block => block as BlockRecord)
    .filter(block => block.type === 'text')
    .map(block => String(block.text ?? ''))
    .join('')
}

export function formatMessageContentForTranscript(
  message: TranscriptMessage,
  options: TranscriptTextOptions,
): string {
  const raw = (message as unknown as { message?: { content?: unknown } })
    .message?.content

  if (!options.includeTools) {
    return extractTextFromMessageContent(raw)
  }

  if (typeof raw === 'string') return raw
  if (!Array.isArray(raw)) return ''

  const collapse = Boolean(options.collapseToolBlocks)
  const maxCollapsedChars = Math.max(1, options.maxCollapsedChars ?? 4000)

  const parts: string[] = []
  for (const block of raw) {
    const type = coerceBlockType(block)
    const record = block as BlockRecord

    if (type === 'text') {
      const text = String(record.text ?? '')
      if (text) parts.push(text)
      continue
    }

    if (type === 'tool_result') {
      const id =
        typeof record.tool_use_id === 'string'
          ? record.tool_use_id
          : typeof record.id === 'string'
            ? record.id
            : ''
      const ok = record.is_error ? 'ERROR' : 'OK'
      const content = formatToolResultContent(record.content)
      const display = collapse
        ? truncateMiddle(content, maxCollapsedChars)
        : content
      parts.push(
        `[tool_result${id ? `:${id}` : ''} ${ok}] ${display}`.trimEnd(),
      )
      continue
    }

    if (
      type === 'tool_use' ||
      type === 'server_tool_use' ||
      type === 'mcp_tool_use'
    ) {
      const name = typeof record.name === 'string' ? record.name : ''
      const input = stringifyForTranscript(record.input)
      const display = collapse
        ? truncateMiddle(input, maxCollapsedChars)
        : input
      parts.push(`[${type}:${name}] ${display}`.trimEnd())
      continue
    }

    if (type) {
      parts.push(`[${type}]`)
    }
  }

  return parts.join('\n')
}

function pushPrefixed(lines: string[], prefix: string, text: string): void {
  const contentLines = text.split('\n')
  const pad = ' '.repeat(prefix.length)
  for (let i = 0; i < contentLines.length; i += 1) {
    const line = contentLines[i] ?? ''
    lines.push(`${i === 0 ? prefix : pad} ${line}`.trimEnd())
  }
}

export function buildTranscriptLines(
  messages: TranscriptMessage[],
  options: TranscriptTextOptions,
): string[] {
  const lines: string[] = []
  let count = 0

  for (const message of messages) {
    if (!message) continue
    if (message.type !== 'user' && message.type !== 'assistant') continue
    count += 1

    const prefix = message.type === 'user' ? 'user:' : 'assistant:'
    const content = formatMessageContentForTranscript(
      message,
      options,
    ).trimEnd()
    pushPrefixed(lines, prefix, content || '(empty)')
    lines.push('')
  }

  if (count === 0) return ['(empty)']
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines
}
