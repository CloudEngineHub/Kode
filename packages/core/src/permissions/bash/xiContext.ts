import type { XiDecision } from './types'

function qQ5(
  input: string,
  keepDoubleQuotes = false,
): { withDoubleQuotes: string; fullyUnquoted: string } {
  let withDoubleQuotes = ''
  let fullyUnquoted = ''
  let inSingle = false
  let inDouble = false
  let escape = false

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!
    if (escape) {
      escape = false
      if (!inSingle) withDoubleQuotes += ch
      if (!inSingle && !inDouble) fullyUnquoted += ch
      continue
    }
    if (ch === '\\\\') {
      escape = true
      if (!inSingle) withDoubleQuotes += ch
      if (!inSingle && !inDouble) fullyUnquoted += ch
      continue
    }
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle
      continue
    }
    if (ch === '\"' && !inSingle) {
      inDouble = !inDouble
      if (!keepDoubleQuotes) continue
    }
    if (!inSingle) withDoubleQuotes += ch
    if (!inSingle && !inDouble) fullyUnquoted += ch
  }

  return { withDoubleQuotes, fullyUnquoted }
}

function NQ5(input: string): string {
  return input
    .replace(/\s+2\s*>&\s*1(?=\s|$)/g, '')
    .replace(/[012]?\s*>\s*\/dev\/null/g, '')
    .replace(/\s*<\s*\/dev\/null/g, '')
}

export function hasUnescapedChar(input: string, ch: string): boolean {
  if (ch.length !== 1)
    throw new Error('hasUnescapedChar only works with single characters')
  let i = 0
  while (i < input.length) {
    if (input[i] === '\\\\' && i + 1 < input.length) {
      i += 2
      continue
    }
    if (input[i] === ch) return true
    i++
  }
  return false
}

export type XiContext = {
  originalCommand: string
  baseCommand: string
  unquotedContent: string
  fullyUnquotedContent: string
}

export type XiAllowResult = { behavior: 'allow'; message: string }
export type XiCheckResult = XiAllowResult | XiDecision
export type XiCheck = (ctx: XiContext) => XiCheckResult

export function createXiContext(command: string): XiContext {
  const baseCommand = command.split(' ')[0] || ''
  const { withDoubleQuotes, fullyUnquoted } = qQ5(command, baseCommand === 'jq')
  return {
    originalCommand: command,
    baseCommand,
    unquotedContent: withDoubleQuotes,
    fullyUnquotedContent: NQ5(fullyUnquoted),
  }
}
