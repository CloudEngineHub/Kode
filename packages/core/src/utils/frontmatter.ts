import yaml from 'js-yaml'

export interface ParsedMarkdownFrontmatter {
  data: Record<string, unknown>
  content: string
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

/**
 * Parse a Markdown document with an optional YAML frontmatter block.
 *
 * The delimiter must be the first line (apart from an optional UTF-8 BOM), and
 * the YAML is restricted to JSON-compatible values. Keeping this parser small
 * makes the accepted format explicit and avoids pulling an outdated YAML
 * implementation through gray-matter.
 */
export function parseMarkdownFrontmatter(
  source: string,
): ParsedMarkdownFrontmatter {
  const bom = source.startsWith('\uFEFF') ? '\uFEFF' : ''
  const input = bom ? source.slice(1) : source
  const opening = input.match(/^---[\t ]*(?:\r?\n|$)/)

  if (!opening) return { data: {}, content: source }

  const bodyStart = opening[0].length
  const remainder = input.slice(bodyStart)
  const closing = /^(?:---|\.\.\.)[\t ]*(?:\r?\n|$)/m.exec(remainder)

  // An opening delimiter without a closing delimiter is ordinary Markdown.
  if (!closing || closing.index === undefined) {
    return { data: {}, content: source }
  }

  const yamlSource = remainder.slice(0, closing.index)
  const content = remainder.slice(closing.index + closing[0].length)
  const loaded = yaml.load(yamlSource, { schema: yaml.JSON_SCHEMA })

  return { data: asRecord(loaded), content }
}
