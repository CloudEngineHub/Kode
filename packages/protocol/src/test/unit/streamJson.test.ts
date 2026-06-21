import { describe, expect, test } from 'bun:test'

import { makeSdkResultMessage } from '#protocol/streamJson'

describe('stream-json protocol helpers', () => {
  test('makeSdkResultMessage supports subtype override without result', () => {
    const msg = makeSdkResultMessage({
      sessionId: 's1',
      numTurns: 0,
      totalCostUsd: 1.23,
      durationMs: 10,
      durationApiMs: 5,
      isError: false,
      subtype: 'error_max_budget_usd',
    })

    expect(msg.type).toBe('result')
    expect((msg as any).subtype).toBe('error_max_budget_usd')
    expect((msg as any).is_error).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(msg, 'result')).toBe(false)
  })

  test('makeSdkResultMessage defaults subtype from isError and includes result when provided', () => {
    const msg = makeSdkResultMessage({
      sessionId: 's2',
      numTurns: 1,
      totalCostUsd: 0,
      durationMs: 0,
      durationApiMs: 0,
      isError: false,
      result: 'ok',
    })

    expect(msg.type).toBe('result')
    expect((msg as any).subtype).toBe('success')
    expect((msg as any).result).toBe('ok')
  })
})
