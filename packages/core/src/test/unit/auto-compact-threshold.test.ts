import { describe, expect, test } from 'bun:test'
import {
  AUTO_COMPACT_MARGIN_TOKENS,
  calculateAutoCompactThresholds,
  getEffectiveConversationContextLimit,
} from '../../utils/autoCompactThreshold'

describe('autoCompactThreshold', () => {
  test('defaults to fixed token margin', () => {
    delete process.env.KODE_AUTOCOMPACT_PCT_OVERRIDE
    delete process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE

    const contextLimit = 50_000
    const below = calculateAutoCompactThresholds(
      contextLimit - AUTO_COMPACT_MARGIN_TOKENS - 1,
      contextLimit,
    )
    expect(below.isAboveAutoCompactThreshold).toBe(false)

    const at = calculateAutoCompactThresholds(
      contextLimit - AUTO_COMPACT_MARGIN_TOKENS,
      contextLimit,
    )
    expect(at.isAboveAutoCompactThreshold).toBe(true)
  })

  test('effective context limit reserves a capped percentage', () => {
    expect(getEffectiveConversationContextLimit(200_000)).toBe(180_000)
    expect(getEffectiveConversationContextLimit(1_000_000)).toBe(980_000)
    expect(getEffectiveConversationContextLimit(0)).toBe(1)
  })

  test('computes percentUsed and tokensRemaining consistently', () => {
    delete process.env.KODE_AUTOCOMPACT_PCT_OVERRIDE
    delete process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE

    const contextLimit = 200_000
    const tokenCount = 180_000
    const result = calculateAutoCompactThresholds(tokenCount, contextLimit)

    expect(result.contextLimit).toBe(contextLimit)
    expect(result.autoCompactThreshold).toBe(
      contextLimit - AUTO_COMPACT_MARGIN_TOKENS,
    )
    expect(result.percentUsed).toBe(
      Math.round((tokenCount / contextLimit) * 100),
    )
    expect(result.tokensRemaining).toBe(
      result.autoCompactThreshold - tokenCount,
    )
  })
})
