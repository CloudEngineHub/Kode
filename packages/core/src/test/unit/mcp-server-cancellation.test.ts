import { describe, expect, test } from 'bun:test'

import { __createLinkedMcpAbortControllerForTests } from '#core/mcp/server'

describe('MCP server cancellation', () => {
  test('links MCP request abort signals into tool abort controllers', () => {
    const requestAbort = new AbortController()
    const linked = __createLinkedMcpAbortControllerForTests(requestAbort.signal)

    requestAbort.abort('client cancelled')

    expect(linked.abortController.signal.aborted).toBe(true)
    expect(linked.abortController.signal.reason).toBe('client cancelled')

    linked.cleanup()
  })

  test('does not propagate after cleanup', () => {
    const requestAbort = new AbortController()
    const linked = __createLinkedMcpAbortControllerForTests(requestAbort.signal)

    linked.cleanup()
    requestAbort.abort('late cancellation')

    expect(linked.abortController.signal.aborted).toBe(false)
  })
})
