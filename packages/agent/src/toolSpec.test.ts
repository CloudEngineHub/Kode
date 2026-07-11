import { describe, expect, test } from 'bun:test'

import { getToolNameFromSpec, parseToolSpec } from './toolSpec'

describe('agent tool specifications', () => {
  test('uses the same strict syntax for persisted and runtime Agent tools', () => {
    expect(parseToolSpec('Read')).toEqual({ name: 'Read' })
    expect(parseToolSpec('Bash(git:*)')).toEqual({
      name: 'Bash',
      commandAllowedRule: 'Bash(git:*)',
    })
    expect(getToolNameFromSpec('Bash(git:*)')).toBe('Bash')

    for (const malformed of ['Read()', 'Read(foo(bar))', 'Read(foo)junk']) {
      expect(() => parseToolSpec(malformed)).toThrow('Invalid agent tool spec')
    }
  })
})
