import { describe, expect, test } from 'bun:test'

import { __useChatForTests } from './useChat'

describe('useChat helpers', () => {
  test('creates visible log events for caught errors', () => {
    expect(
      __useChatForTests.createErrorLogEvent(new Error('socket closed')),
    ).toEqual({
      type: 'log',
      log: {
        level: 'error',
        message: 'socket closed',
      },
    })
  })
})
