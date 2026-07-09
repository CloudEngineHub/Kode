import { describe, expect, test } from 'bun:test'

import {
  __createLinkedMcpAbortControllerForTests,
  __createMcpProgressReporterForTests,
} from '#core/mcp/server'
import { createAssistantMessage } from '#core/utils/messages'

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

  test('sends MCP progress notifications when the request includes a progress token', async () => {
    const notifications: unknown[] = []
    const reporter = __createMcpProgressReporterForTests(
      {
        _meta: { progressToken: 'tool-progress-token' },
        sendNotification: async notification => {
          notifications.push(notification)
        },
      },
      'Bash',
    )

    await reporter({
      type: 'progress',
      content: createAssistantMessage(
        '<tool-progress>Running\u001B[2J command</tool-progress>',
      ),
    })

    expect(notifications).toEqual([
      {
        method: 'notifications/progress',
        params: {
          progressToken: 'tool-progress-token',
          progress: 1,
          message: 'Running command',
        },
      },
    ])
  })

  test('does not send MCP progress notifications without a progress token', async () => {
    const notifications: unknown[] = []
    const reporter = __createMcpProgressReporterForTests(
      {
        sendNotification: async notification => {
          notifications.push(notification)
        },
      },
      'Bash',
    )

    await reporter({
      type: 'progress',
      content: createAssistantMessage('<tool-progress>Running</tool-progress>'),
    })

    expect(notifications).toEqual([])
  })
})
