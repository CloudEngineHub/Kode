import { describe, expect, test } from 'bun:test'

import { MaxTurnsExceededError } from '#core/errors/maxTurns'
import { messagePipeline } from '#core/engine/message-pipeline'

describe('maxTurns', () => {
  test('throws before starting a new model call when maxTurns is reached', async () => {
    const gen = messagePipeline(
      [],
      [],
      {},
      // Should not be called.
      (async () => ({ result: false })) as any,
      {
        abortController: new AbortController(),
        messageId: undefined,
        readFileTimestamps: {},
        setToolJSX: () => {},
        turnCount: 1,
        options: {
          commands: [],
          forkNumber: 0,
          messageLogName: 'unused',
          tools: [],
          verbose: false,
          safeMode: false,
          maxThinkingTokens: 0,
          maxTurns: 1,
        },
      } as any,
    )

    try {
      for await (const _ of gen) {
        throw new Error('Expected generator to throw before yielding')
      }
      throw new Error('Expected generator to throw')
    } catch (err) {
      expect(err).toBeInstanceOf(MaxTurnsExceededError)
      const typed = err as MaxTurnsExceededError
      expect(typed.maxTurns).toBe(1)
      expect(typed.turnCount).toBe(1)
    }
  })
})
