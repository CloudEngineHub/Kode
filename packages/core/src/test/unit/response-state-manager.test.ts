import { describe, expect, test } from 'bun:test'
import { ResponseStateManager } from '#core/services/responseStateManager'

describe('ResponseStateManager', () => {
  test('cleans inactive conversations lazily without a background timer', () => {
    let now = 1_000
    const manager = new ResponseStateManager(() => now, 100)

    manager.setPreviousResponseId('stale', 'response-1')
    now = 1_101
    manager.setPreviousResponseId('active', 'response-2')

    expect(manager.getStateSize()).toBe(1)
    expect(manager.getPreviousResponseId('stale')).toBeUndefined()
    expect(manager.getPreviousResponseId('active')).toBe('response-2')
  })

  test('refreshes the inactivity deadline when a conversation is read', () => {
    let now = 1_000
    const manager = new ResponseStateManager(() => now, 100)

    manager.setPreviousResponseId('conversation', 'response-1')
    now = 1_090
    expect(manager.getPreviousResponseId('conversation')).toBe('response-1')

    now = 1_101
    expect(manager.getStateSize()).toBe(1)

    now = 1_202
    expect(manager.getStateSize()).toBe(0)
  })

  test('resets cleanup scheduling when all state is cleared', () => {
    let now = 1_000
    const manager = new ResponseStateManager(() => now, 100)

    manager.setPreviousResponseId('conversation', 'response-1')
    now = 1_050
    manager.clearAll()
    manager.setPreviousResponseId('next', 'response-2')

    now = 1_101
    expect(manager.getPreviousResponseId('next')).toBe('response-2')
  })
})
