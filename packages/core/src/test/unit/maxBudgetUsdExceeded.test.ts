import { describe, expect, test } from 'bun:test'

import { addToTotalCost, resetStateForTests } from '#core/cost-tracker'
import { MaxBudgetUsdExceededError } from '#core/errors/maxBudgetUsd'
import { messagePipeline } from '#core/engine/message-pipeline'

describe('maxBudgetUsd', () => {
  test('throws before starting a new model call when budget is already exceeded', async () => {
    resetStateForTests()
    addToTotalCost(1, 0)

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
        options: {
          commands: [],
          forkNumber: 0,
          messageLogName: 'unused',
          tools: [],
          verbose: false,
          safeMode: false,
          maxThinkingTokens: 0,
          maxBudgetUsd: 0.5,
        },
      } as any,
    )

    try {
      for await (const _ of gen) {
        throw new Error('Expected generator to throw before yielding')
      }
      throw new Error('Expected generator to throw')
    } catch (err) {
      expect(err).toBeInstanceOf(MaxBudgetUsdExceededError)
    }
  })
})
