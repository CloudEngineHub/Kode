import { readFileSync } from 'node:fs'
import matter from 'gray-matter'

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

export function readMarkdownFile(
  filePath: string,
):
  | { frontmatter: Record<string, unknown>; content: string }
  | { error: string } {
  try {
    const raw = readFileSync(filePath, 'utf8')
    const parsed = matter(raw)
    return {
      frontmatter: asRecord(parsed.data),
      content: String(parsed.content ?? ''),
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}
