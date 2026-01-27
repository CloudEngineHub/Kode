import { describe, expect, it } from 'bun:test'
import { __getQueuedPromptLinesForTests } from './QueuedPrompts'

describe('__getQueuedPromptLinesForTests', () => {
  it('returns empty when there are no queued prompts', () => {
    expect(
      __getQueuedPromptLinesForTests({ queuedPrompts: [], width: 80 }),
    ).toEqual([])
  })

  it('wraps and truncates long messages per item', () => {
    const lines = __getQueuedPromptLinesForTests({
      queuedPrompts: ['This is a longer message that should be wrapped'],
      width: 20,
      maxLinesPerMessage: 2,
    })

    expect(lines.some(line => line.includes('↳'))).toBe(true)
    expect(lines.some(line => line.trim() === '…')).toBe(true)
  })

  it('caps visible messages and hints about earlier items', () => {
    const lines = __getQueuedPromptLinesForTests({
      queuedPrompts: ['a', 'b', 'c', 'd'],
      width: 40,
      maxMessages: 2,
    })

    expect(lines[0]).toContain('earlier')
    expect(lines.join('\n')).toContain('c')
    expect(lines.join('\n')).toContain('d')
    expect(lines.join('\n')).not.toContain('↳ a')
    expect(lines.join('\n')).not.toContain('↳ b')
  })
})
