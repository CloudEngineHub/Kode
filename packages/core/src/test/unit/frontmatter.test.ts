import { describe, expect, test } from 'bun:test'

import { parseMarkdownFrontmatter } from '#core/utils/frontmatter'

describe('parseMarkdownFrontmatter', () => {
  test('parses JSON-compatible YAML and preserves the Markdown body', () => {
    const parsed = parseMarkdownFrontmatter(
      '---\nname: review\nenabled: true\ntools:\n  - Read\n  - Bash\n---\n# Review\n',
    )

    expect(parsed).toEqual({
      data: { name: 'review', enabled: true, tools: ['Read', 'Bash'] },
      content: '# Review\n',
    })
  })

  test('supports a BOM, CRLF, and the YAML document-end delimiter', () => {
    const parsed = parseMarkdownFrontmatter(
      '\uFEFF---\r\nname: command\r\n...\r\nbody\r\n',
    )

    expect(parsed).toEqual({ data: { name: 'command' }, content: 'body\r\n' })
  })

  test('leaves documents without a complete frontmatter block unchanged', () => {
    for (const source of ['# Heading\n', '---\nname: incomplete\n']) {
      expect(parseMarkdownFrontmatter(source)).toEqual({
        data: {},
        content: source,
      })
    }
  })

  test('does not accept arrays as frontmatter metadata', () => {
    const parsed = parseMarkdownFrontmatter('---\n- one\n- two\n---\nbody')
    expect(parsed).toEqual({ data: {}, content: 'body' })
  })
})
