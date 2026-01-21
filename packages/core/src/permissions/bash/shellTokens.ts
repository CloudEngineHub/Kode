import { parse, quote, type ParseEntry } from 'shell-quote'

const SINGLE_QUOTE = '__SINGLE_QUOTE__'
const DOUBLE_QUOTE = '__DOUBLE_QUOTE__'
const NEW_LINE = '__NEW_LINE__'
const LINE_CONTINUATION_RE = /\\\r?\n/g

export const SAFE_SHELL_SEPARATORS = new Set([
  '&&',
  '||',
  ';',
  '&',
  '|',
  '|&',
  ';;',
])

export type ParsedShellTokens =
  | { success: true; tokens: ParseEntry[] }
  | { success: false; error: string }

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null
}

export function getShellTokenOp(entry: unknown): string | null {
  const record = asRecord(entry)
  if (!record || !('op' in record)) return null
  const op = record.op
  if (typeof op === 'string') return op
  return op === undefined || op === null ? null : String(op)
}

export function isOpToken(entry: unknown, op: string): entry is { op: string } {
  const tokenOp = getShellTokenOp(entry)
  return tokenOp === op
}

export function isGlobToken(
  entry: unknown,
): entry is { op: 'glob'; pattern: string } {
  const record = asRecord(entry)
  return !!record && record.op === 'glob' && typeof record.pattern === 'string'
}

function hasCommentToken(entry: unknown): boolean {
  const record = asRecord(entry)
  return !!record && 'comment' in record
}

export function normalizeBashLineContinuations(command: string): string {
  if (!command.includes('\\')) return command
  return command.replace(LINE_CONTINUATION_RE, '')
}

export function parseShellTokens(
  command: string,
  options?: { preserveNewlines?: boolean },
): ParsedShellTokens {
  try {
    const normalizedCommand = normalizeBashLineContinuations(command)
    const input = options?.preserveNewlines
      ? normalizedCommand
          .replaceAll('"', `"${DOUBLE_QUOTE}`)
          .replaceAll("'", `'${SINGLE_QUOTE}`)
          .replaceAll('\n', `\n${NEW_LINE}\n`)
      : normalizedCommand
          .replaceAll('"', `"${DOUBLE_QUOTE}`)
          .replaceAll("'", `'${SINGLE_QUOTE}`)

    return {
      success: true,
      tokens: parse(input, varName => `$${varName}`),
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export function restoreShellStringToken(token: string): string {
  return token.replaceAll(SINGLE_QUOTE, "'").replaceAll(DOUBLE_QUOTE, '"')
}

function isSafeNewlineMarker(value: string): boolean {
  return value === NEW_LINE
}

function isSafeFd(value: string): boolean {
  const v = value.trim()
  return v === '0' || v === '1' || v === '2'
}

function hasUnescapedVarSuffixToken(
  token: unknown,
  tokens: ParseEntry[],
  index: number,
): boolean {
  if (typeof token !== 'string') return false
  const t = token
  if (t === '$') return true
  if (!t.endsWith('$')) return false

  if (t.includes('=') && t.endsWith('=$')) return true

  let depth = 1
  for (let i = index + 1; i < tokens.length && depth > 0; i++) {
    const next = tokens[i]
    if (isOpToken(next, '(')) depth++
    if (isOpToken(next, ')') && --depth === 0) {
      const after = tokens[i + 1]
      return typeof after === 'string' && !after.startsWith(' ')
    }
  }
  return false
}

function isWeirdTokenNeedingQuotes(value: string): boolean {
  if (/^\d+>>?$/.test(value)) return false
  if (value.includes(' ') || value.includes('\t')) return true
  if (value.length === 1 && '><|&;()'.includes(value)) return true
  return false
}

function joinTokensWithMinimalSpacing(
  out: string,
  next: string,
  noSpace: boolean,
): string {
  if (!out || noSpace) return `${out}${next}`
  return `${out} ${next}`
}

export function rebuildCommandFromTokens(
  tokens: ParseEntry[],
  fallback: string,
): string {
  if (tokens.length === 0) return fallback
  let out = ''
  let parenDepth = 0
  let inProcessSubstitution = false

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    const prev = tokens[i - 1]
    const next = tokens[i + 1]

    if (typeof token === 'string') {
      const raw = token
      const restored = restoreShellStringToken(raw)
      const cameFromQuotedString =
        raw.includes(SINGLE_QUOTE) || raw.includes(DOUBLE_QUOTE)
      const needsQuoting = cameFromQuotedString
        ? restored
        : /[|&;]/.test(restored)
          ? `"${restored}"`
          : isWeirdTokenNeedingQuotes(restored)
            ? quote([restored])
            : restored

      const noSpace = out.endsWith('(') || prev === '$' || isOpToken(prev, ')')

      if (out.endsWith('<(')) {
        out += ` ${needsQuoting}`
      } else {
        out = joinTokensWithMinimalSpacing(out, needsQuoting, noSpace)
      }
      continue
    }

    const op = getShellTokenOp(token)
    if (!op) continue

    if (op === 'glob' && isGlobToken(token)) {
      out = joinTokensWithMinimalSpacing(out, token.pattern, false)
      continue
    }

    if (
      op === '>&' &&
      typeof prev === 'string' &&
      /^\d+$/.test(prev) &&
      typeof next === 'string' &&
      /^\d+$/.test(next)
    ) {
      const idx = out.lastIndexOf(prev)
      if (idx !== -1) {
        out = out.slice(0, idx) + `${prev}${op}${next}`
        i++
        continue
      }
    }

    // Bash `&>` / `&>>` redirects stdout+stderr.
    // `shell-quote` tokenizes this as `{op:'&'},{op:'>'}` (or `>>`), so we
    // reconstruct a single operator to preserve semantics.
    if (op === '&' && (isOpToken(next, '>') || isOpToken(next, '>>'))) {
      const combined = isOpToken(next, '>>') ? '&>>' : '&>'
      out = joinTokensWithMinimalSpacing(out, combined, false)
      i++
      continue
    }

    if (op === '<' && isOpToken(next, '<')) {
      const after = tokens[i + 2]
      if (typeof after === 'string') {
        out = joinTokensWithMinimalSpacing(out, after, false)
        i += 2
        continue
      }
    }

    if (op === '<<<') {
      out = joinTokensWithMinimalSpacing(out, op, false)
      continue
    }

    if (op === '(') {
      if (hasUnescapedVarSuffixToken(prev, tokens, i) || parenDepth > 0) {
        parenDepth++
        if (out.endsWith(' ')) out = out.slice(0, -1)
        out += '('
      } else if (out.endsWith('$')) {
        if (hasUnescapedVarSuffixToken(prev, tokens, i)) {
          parenDepth++
          out += '('
        } else {
          out = joinTokensWithMinimalSpacing(out, '(', false)
        }
      } else {
        const noSpace = out.endsWith('<(') || out.endsWith('(')
        out = joinTokensWithMinimalSpacing(out, '(', noSpace)
      }
      continue
    }

    if (op === ')') {
      if (inProcessSubstitution) {
        inProcessSubstitution = false
        out += ')'
        continue
      }
      if (parenDepth > 0) parenDepth--
      out += ')'
      continue
    }

    if (op === '<(') {
      inProcessSubstitution = true
      out = joinTokensWithMinimalSpacing(out, op, false)
      continue
    }

    if (['&&', '||', '|', '|&', ';', ';;', '&', '>', '>>', '<'].includes(op)) {
      out = joinTokensWithMinimalSpacing(out, op, false)
      continue
    }
  }

  return out.trim() || fallback
}

export function splitBashCommandIntoSubcommands(command: string): string[] {
  const parsed = parseShellTokens(command, { preserveNewlines: true })
  if ('error' in parsed) throw new Error(parsed.error)

  const out: string[] = []
  let currentTokens: ParseEntry[] = []

  const flush = () => {
    const rebuilt = rebuildCommandFromTokens(currentTokens, '').trim()
    if (rebuilt) out.push(rebuilt)
    currentTokens = []
  }

  for (let i = 0; i < parsed.tokens.length; i++) {
    const token = parsed.tokens[i]
    const next = parsed.tokens[i + 1]
    if (typeof token === 'string') {
      const restored = restoreShellStringToken(token)
      if (isSafeNewlineMarker(restored)) {
        flush()
        continue
      }
    }
    const op = getShellTokenOp(token)
    // `&>` / `&>>` is a redirection operator, not a command separator.
    if (op === '&' && (isOpToken(next, '>') || isOpToken(next, '>>'))) {
      currentTokens.push(token)
      continue
    }

    if (op && SAFE_SHELL_SEPARATORS.has(op)) {
      flush()
      continue
    }
    currentTokens.push(token)
  }
  flush()
  return out
}

function isSafeCommandList(command: string): boolean {
  const parsed = parseShellTokens(command)
  if (!parsed.success) return false

  for (let i = 0; i < parsed.tokens.length; i++) {
    const token = parsed.tokens[i]
    const next = parsed.tokens[i + 1]
    if (!token) continue
    if (typeof token === 'string') continue
    if (typeof token !== 'object') continue
    if (hasCommentToken(token)) return false

    const op = getShellTokenOp(token)
    if (!op) continue
    if (op === 'glob') continue
    if (SAFE_SHELL_SEPARATORS.has(op)) continue
    if (op === '>&') {
      if (typeof next === 'string' && isSafeFd(next)) continue
    }
    if (op === '>' || op === '>>') continue
    return false
  }
  return true
}

export function isUnsafeCompoundCommand(command: string): boolean {
  try {
    return (
      splitBashCommandIntoSubcommands(command).length > 1 &&
      !isSafeCommandList(command)
    )
  } catch {
    return true
  }
}
