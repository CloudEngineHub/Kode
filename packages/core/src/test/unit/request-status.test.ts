import { afterEach, describe, expect, test } from 'bun:test'
import {
  getRequestStatus,
  setRequestStatus,
  subscribeRequestStatus,
  updateRequestTokens,
  type RequestStatus,
} from '#core/utils/requestStatus'

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

describe('request status token updates', () => {
  afterEach(() => {
    setRequestStatus({ kind: 'idle' })
  })

  test('coalesces bursty output token updates for subscribers', async () => {
    const seen: RequestStatus[] = []
    setRequestStatus({ kind: 'streaming' })
    const unsubscribe = subscribeRequestStatus(status => {
      seen.push({ ...status })
    })

    try {
      updateRequestTokens(1)
      updateRequestTokens(2)
      updateRequestTokens(3)

      expect(seen.map(status => status.outputTokens)).toEqual([1])
      expect(getRequestStatus().outputTokens).toBe(3)

      await wait(240)

      expect(seen.map(status => status.outputTokens)).toEqual([1, 3])
    } finally {
      unsubscribe()
    }
  })

  test('cancels a pending token notification when the request returns to idle', async () => {
    const seen: RequestStatus[] = []
    setRequestStatus({ kind: 'streaming' })
    const unsubscribe = subscribeRequestStatus(status => {
      seen.push({ ...status })
    })

    try {
      updateRequestTokens(1)
      updateRequestTokens(2)
      setRequestStatus({ kind: 'idle' })

      await wait(240)

      expect(seen.map(status => status.kind)).toEqual(['streaming', 'idle'])
      expect(seen.map(status => status.outputTokens)).toEqual([1, 2])
    } finally {
      unsubscribe()
    }
  })
})
