import { describe, expect, it } from 'bun:test'

import {
  buildTranscriptLines,
  extractTextFromMessageContent,
  formatMessageContentForTranscript,
} from './transcriptText'

describe('extractTextFromMessageContent', () => {
  it('returns plain strings as-is', () => {
    expect(extractTextFromMessageContent('hello')).toBe('hello')
  })

  it('concatenates text blocks and ignores non-text blocks', () => {
    const content = [
      { type: 'text', text: 'a' },
      { type: 'tool_use', name: 'Bash', input: { cmd: 'ls' } },
      { type: 'text', text: 'b' },
    ]
    expect(extractTextFromMessageContent(content)).toBe('ab')
  })
})

describe('formatMessageContentForTranscript', () => {
  it('omits tool blocks when includeTools=false', () => {
    const message = {
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: 'hi' },
          { type: 'tool_use', name: 'Bash', input: { cmd: 'ls' } },
        ],
      },
    } as any

    expect(
      formatMessageContentForTranscript(message, { includeTools: false }),
    ).toBe('hi')
  })

  it('includes tool blocks when includeTools=true', () => {
    const message = {
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: 'hi' },
          { type: 'tool_use', name: 'Bash', input: { cmd: 'ls' } },
          {
            type: 'tool_result',
            tool_use_id: 'tool-1',
            is_error: false,
            content: 'ok',
          },
        ],
      },
    } as any

    const out = formatMessageContentForTranscript(message, {
      includeTools: true,
    })
    expect(out).toContain('hi')
    expect(out).toContain('[tool_use:Bash]')
    expect(out).toContain('"cmd": "ls"')
    expect(out).toContain('[tool_result:tool-1 OK] ok')
  })

  it('can collapse tool blocks', () => {
    const message = {
      type: 'assistant',
      message: {
        content: [
          { type: 'tool_use', name: 'Bash', input: { cmd: 'echo 1234567890' } },
        ],
      },
    } as any

    const out = formatMessageContentForTranscript(message, {
      includeTools: true,
      collapseToolBlocks: true,
      maxCollapsedChars: 10,
    })
    expect(out).toContain('...')
  })
})

describe('buildTranscriptLines', () => {
  it('builds prefixed transcript lines', () => {
    const messages = [
      { type: 'user', message: { content: [{ type: 'text', text: 'u' }] } },
      {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'a' }] },
      },
    ] as any

    const lines = buildTranscriptLines(messages, { includeTools: false })
    expect(lines.join('\n')).toContain('user: u')
    expect(lines.join('\n')).toContain('assistant: a')
  })

  it('returns (empty) when there are no user/assistant messages', () => {
    const messages = [{ type: 'progress', content: {} }] as any
    expect(buildTranscriptLines(messages, { includeTools: false })).toEqual([
      '(empty)',
    ])
  })
})
