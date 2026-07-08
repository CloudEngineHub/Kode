import { parse, type ParseEntry } from 'shell-quote'

const SINGLE_QUOTE = '__SINGLE_QUOTE__'
const DOUBLE_QUOTE = '__DOUBLE_QUOTE__'
const NEW_LINE = '__NEW_LINE__'

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  if (Array.isArray(value)) return null
  return value as Record<string, unknown>
}

const COMMAND_LIST_SEPARATORS = new Set<string>([
  '&&',
  '||',
  ';',
  '&',
  '|',
  '|&',
])

/**
 * Splits a command string into individual commands based on shell operators.
 */
export function splitCommand(command: string): string[] {
  const tokens: ParseEntry[] = []

  const normalized = command.replace(/\r\n/g, '\n').replace(/\\\n/g, '')

  const parsed = parse(
    normalized
      .replaceAll('"', `"${DOUBLE_QUOTE}`)
      .replaceAll("'", `'${SINGLE_QUOTE}`)
      .replaceAll('\n', `\n${NEW_LINE}\n`),
    varName => `$${varName}`,
  )

  function pushStringToken(part: string) {
    if (part === '') return
    if (part === NEW_LINE) {
      tokens.push(part)
      return
    }
    if (
      tokens.length > 0 &&
      typeof tokens[tokens.length - 1] === 'string' &&
      tokens[tokens.length - 1] !== NEW_LINE
    ) {
      tokens[tokens.length - 1] += ' ' + part
      return
    }
    tokens.push(part)
  }

  let pendingLineContinuation = false
  for (const part of parsed) {
    if (typeof part === 'string') {
      if (part === '') {
        pendingLineContinuation = true
        continue
      }

      if (part === NEW_LINE && pendingLineContinuation) {
        pendingLineContinuation = false
        continue
      }

      pendingLineContinuation = false
      pushStringToken(part)
      continue
    }

    pendingLineContinuation = false

    if (
      part &&
      typeof part === 'object' &&
      'op' in part &&
      part.op === 'glob'
    ) {
      const record = asRecord(part)
      const pattern =
        record && 'pattern' in record ? String(record.pattern) : ''
      pushStringToken(pattern)
      continue
    }

    tokens.push(part)
  }

  const parts: Array<string | null> = tokens.map(part => {
    if (typeof part === 'string') {
      const restored = part
        .replaceAll(`${SINGLE_QUOTE}`, "'")
        .replaceAll(`${DOUBLE_QUOTE}`, '"')
      if (restored === NEW_LINE) return null
      return restored
    }
    if (!part || typeof part !== 'object') return null
    if ('comment' in part) return null
    if ('op' in part) {
      const record = asRecord(part)
      if (record && typeof record.op === 'string') return record.op
    }
    return null
  })

  const out: string[] = []
  let current = ''
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    const next = parts[i + 1]

    if (part === null) {
      const trimmed = current.trim()
      if (trimmed) out.push(trimmed)
      current = ''
      continue
    }

    if (part === '&' && (next === '>' || next === '>>')) {
      const combined = `${part}${next}`
      current = current ? `${current} ${combined}` : combined
      i++
      continue
    }

    if (COMMAND_LIST_SEPARATORS.has(part)) {
      const trimmed = current.trim()
      if (trimmed) out.push(trimmed)
      current = ''
      continue
    }

    current = current ? `${current} ${part}` : part
  }
  const trimmed = current.trim()
  if (trimmed) out.push(trimmed)

  return out
}
