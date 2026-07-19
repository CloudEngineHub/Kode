import { describe, expect, test } from 'bun:test'
import { resolveAgentColor } from './agentColor'

describe('resolveAgentColor', () => {
  test('maps every picker color to an Ink-compatible terminal color', () => {
    expect(resolveAgentColor('red')).toBe('#ef4444')
    expect(resolveAgentColor('blue')).toBe('#3b82f6')
    expect(resolveAgentColor('green')).toBe('#22c55e')
    expect(resolveAgentColor('yellow')).toBe('#eab308')
    expect(resolveAgentColor('purple')).toBe('#a855f7')
    expect(resolveAgentColor('orange')).toBe('#f97316')
    expect(resolveAgentColor('pink')).toBe('#ec4899')
    expect(resolveAgentColor('cyan')).toBe('#06b6d4')
  })

  test('keeps explicit terminal colors and ignores automatic values', () => {
    expect(resolveAgentColor('#123456')).toBe('#123456')
    expect(resolveAgentColor('rgb(1, 2, 3)')).toBe('rgb(1, 2, 3)')
    expect(resolveAgentColor('automatic')).toBeUndefined()
    expect(resolveAgentColor('  ')).toBeUndefined()
    expect(resolveAgentColor(undefined)).toBeUndefined()
  })
})
