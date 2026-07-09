import { afterEach, describe, expect, test } from 'bun:test'
import type { LoggingMessageNotification } from '@modelcontextprotocol/sdk/types.js'

import {
  __resetMcpLoggingForTests,
  handleMcpLoggingMessage,
  subscribeMcpLogMessage,
} from '#core/mcp/client'
import {
  clearNotifications,
  getNotifications,
} from '#core/services/notificationCenter'

function createLoggingNotification(
  params: LoggingMessageNotification['params'],
): LoggingMessageNotification {
  return {
    method: 'notifications/message',
    params,
  }
}

describe('MCP logging notifications', () => {
  afterEach(() => {
    __resetMcpLoggingForTests()
    clearNotifications()
  })

  test('publishes low-severity events without creating in-app notifications', () => {
    const events: Array<{
      server: string
      level: string
      logger?: string
      data: unknown
    }> = []

    subscribeMcpLogMessage(event => {
      events.push(event)
    })

    handleMcpLoggingMessage(
      'codegraph',
      createLoggingNotification({
        level: 'info',
        logger: 'indexer',
        data: 'Indexed 4 files',
      }),
    )

    expect(events).toEqual([
      {
        server: 'codegraph',
        level: 'info',
        logger: 'indexer',
        data: 'Indexed 4 files',
      },
    ])
    expect(getNotifications()).toEqual([])
  })

  test('shows notice logs with redacted sensitive object keys', () => {
    handleMcpLoggingMessage(
      'codegraph',
      createLoggingNotification({
        level: 'notice',
        data: {
          message: 'Index refreshed',
          apiKey: 'secret-value',
          nested: {
            token: 'nested-secret',
          },
        },
      }),
    )

    const notifications = getNotifications()
    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({
      title: 'MCP notice: codegraph',
      kind: 'info',
      source: 'system',
      channel: 'mcp:logging',
    })
    expect(notifications[0]?.message).toContain('Index refreshed')
    expect(notifications[0]?.message).toContain('[redacted]')
    expect(notifications[0]?.message).not.toContain('secret-value')
    expect(notifications[0]?.message).not.toContain('nested-secret')
  })

  test('unsubscribe stops observer delivery', () => {
    const events: string[] = []
    const unsubscribe = subscribeMcpLogMessage(event => {
      events.push(event.server)
    })

    unsubscribe()
    handleMcpLoggingMessage(
      'codegraph',
      createLoggingNotification({
        level: 'debug',
        data: 'hidden',
      }),
    )

    expect(events).toEqual([])
  })
})
