import { describe, expect, test } from 'bun:test'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

function parseTokensDirect(input: string): string[] {
  const { parse } = require('shell-quote')
  const parts = parse(input)
  const out: string[] = []
  for (const part of parts) {
    if (typeof part === 'string') out.push(part)
  }
  return out
}

function parseTokensWindows(input: string): string[] {
  const tokens: string[] = []
  let current = ''
  let inSingleQuote = false
  let inDoubleQuote = false
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (ch === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote
      continue
    }
    if (ch === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote
      continue
    }
    if (ch === ' ' && !inSingleQuote && !inDoubleQuote) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      continue
    }
    current += ch
  }
  if (current) tokens.push(current)
  return tokens
}

describe('plugin command tokenizer', () => {
  describe('Unix-style tokenizer (shell-quote)', () => {
    test('simple space-separated tokens', () => {
      const tokens = parseTokensDirect('marketplace add source')
      expect(tokens).toEqual(['marketplace', 'add', 'source'])
    })

    test('quoted strings with spaces', () => {
      const tokens = parseTokensDirect('marketplace add "my source"')
      expect(tokens).toEqual(['marketplace', 'add', 'my source'])
    })

    test('single-quoted strings', () => {
      const tokens = parseTokensDirect("marketplace add 'my source'")
      expect(tokens).toEqual(['marketplace', 'add', 'my source'])
    })
  })

  describe('Windows-style tokenizer (backslash-safe)', () => {
    test('simple space-separated tokens', () => {
      const tokens = parseTokensWindows('marketplace add source')
      expect(tokens).toEqual(['marketplace', 'add', 'source'])
    })

    test('Windows path with backslashes is preserved', () => {
      const tokens = parseTokensWindows(
        'marketplace add C:\\Users\\alice\\skills',
      )
      expect(tokens).toEqual(['marketplace', 'add', 'C:\\Users\\alice\\skills'])
    })

    test('Windows path with spaces in quotes', () => {
      const tokens = parseTokensWindows(
        'marketplace add "C:\\Users\\alice name\\skills"',
      )
      expect(tokens).toEqual([
        'marketplace',
        'add',
        'C:\\Users\\alice name\\skills',
      ])
    })

    test('single-quoted strings on Windows', () => {
      const tokens = parseTokensWindows(
        "marketplace add 'C:\\Users\\alice\\skills'",
      )
      expect(tokens).toEqual(['marketplace', 'add', 'C:\\Users\\alice\\skills'])
    })

    test('mixed flags and paths', () => {
      const tokens = parseTokensWindows(
        'install my-plugin --scope user --force',
      )
      expect(tokens).toEqual([
        'install',
        'my-plugin',
        '--scope',
        'user',
        '--force',
      ])
    })

    test('empty input returns empty array', () => {
      const tokens = parseTokensWindows('')
      expect(tokens).toEqual([])
    })

    test('whitespace-only input returns empty array', () => {
      const tokens = parseTokensWindows('   ')
      expect(tokens).toEqual([])
    })

    test('multiple spaces between tokens', () => {
      const tokens = parseTokensWindows('marketplace  add   source')
      expect(tokens).toEqual(['marketplace', 'add', 'source'])
    })

    test('8.3 short name paths preserved', () => {
      const tokens = parseTokensWindows(
        'marketplace add C:\\Users\\ADMINI~1\\AppData\\skills',
      )
      expect(tokens).toEqual([
        'marketplace',
        'add',
        'C:\\Users\\ADMINI~1\\AppData\\skills',
      ])
    })

    test('UNC path preserved', () => {
      const tokens = parseTokensWindows(
        'marketplace add \\\\server\\share\\skills',
      )
      expect(tokens).toEqual([
        'marketplace',
        'add',
        '\\\\server\\share\\skills',
      ])
    })
  })

  describe('shell-quote backslash mangling (demonstrates the bug)', () => {
    test('shell-quote strips backslashes from Windows paths', () => {
      const tokens = parseTokensDirect(
        'marketplace add C:\\Users\\alice\\skills',
      )
      const joined = tokens.join(' ')
      expect(joined).not.toContain('C:\\Users\\alice\\skills')
    })

    test('Windows tokenizer preserves backslashes', () => {
      const tokens = parseTokensWindows(
        'marketplace add C:\\Users\\alice\\skills',
      )
      const joined = tokens.join(' ')
      expect(joined).toContain('C:\\Users\\alice\\skills')
    })
  })
})
