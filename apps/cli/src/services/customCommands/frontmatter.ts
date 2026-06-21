import matter from 'gray-matter'
import yaml from 'js-yaml'

import type { CustomCommandFrontmatter } from './types'

export function parseFrontmatter(content: string): {
  frontmatter: CustomCommandFrontmatter
  content: string
} {
  const yamlSchema = (yaml as { JSON_SCHEMA?: unknown }).JSON_SCHEMA
  const parsed = matter(content, {
    engines: {
      yaml: {
        parse: (input: string): object => {
          const loaded = yaml.load(
            input,
            yamlSchema ? { schema: yamlSchema } : undefined,
          )
          return typeof loaded === 'object' && loaded !== null ? loaded : {}
        },
      },
    },
  })
  return {
    frontmatter: (parsed.data ?? {}) as CustomCommandFrontmatter,
    content: parsed.content ?? '',
  }
}

export function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  }
  return false
}

export function parseAllowedTools(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(v => String(v).trim()).filter(Boolean)
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []
    return trimmed
      .split(/\s+/)
      .map(v => v.trim())
      .filter(Boolean)
  }
  return []
}

export function parseMaxThinkingTokens(
  frontmatter: CustomCommandFrontmatter,
): number | undefined {
  const raw =
    frontmatter.maxThinkingTokens ??
    frontmatter.max_thinking_tokens ??
    frontmatter['max-thinking-tokens'] ??
    frontmatter['max_thinking_tokens']
  if (raw === undefined || raw === null) return undefined
  const value = typeof raw === 'number' ? raw : Number(String(raw).trim())
  if (!Number.isFinite(value) || value < 0) return undefined
  return Math.floor(value)
}

export function extractDescriptionFromMarkdown(
  markdown: string,
  fallback: string,
): string {
  const lines = markdown.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const heading = trimmed.match(/^#{1,6}\s+(.*)$/)
    if (heading?.[1]) return heading[1].trim()
    return trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed
  }
  return fallback
}
