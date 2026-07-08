import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
  __resetMcpResourceUpdatesForTests,
  __setMcpClientsForTests,
  notifyMcpResourceUpdated,
  subscribeMCPResource,
  subscribeMcpResourceUpdated,
  unsubscribeMCPResource,
} from '#core/mcp/client'
import {
  clearNotifications,
  getNotifications,
} from '#core/services/notificationCenter'

describe('MCP resource update subscriptions', () => {
  beforeEach(() => {
    __resetMcpResourceUpdatesForTests()
    clearNotifications()
  })

  afterEach(() => {
    __setMcpClientsForTests(null)
    __resetMcpResourceUpdatesForTests()
    clearNotifications()
  })

  test('subscribeMCPResource and unsubscribeMCPResource call the SDK client', async () => {
    const calls: unknown[] = []
    const client = {
      subscribeResource: async (params: unknown) => {
        calls.push({ method: 'resources/subscribe', params })
      },
      unsubscribeResource: async (params: unknown) => {
        calls.push({ method: 'resources/unsubscribe', params })
      },
      getServerCapabilities: () => ({ resources: { subscribe: true } }),
    }

    __setMcpClientsForTests([
      {
        type: 'connected',
        name: 'srv',
        client,
        capabilities: { resources: { subscribe: true } },
      } as any,
    ])

    await subscribeMCPResource({ server: 'srv', uri: 'file:///one' })
    await unsubscribeMCPResource({ server: 'srv', uri: 'file:///one' })

    expect(calls).toEqual([
      { method: 'resources/subscribe', params: { uri: 'file:///one' } },
      { method: 'resources/unsubscribe', params: { uri: 'file:///one' } },
    ])
  })

  test('subscribeMCPResource rejects servers without resource subscriptions', async () => {
    __setMcpClientsForTests([
      {
        type: 'connected',
        name: 'srv',
        client: {
          getServerCapabilities: () => ({ resources: {} }),
        },
        capabilities: { resources: {} },
      } as any,
    ])

    await expect(
      subscribeMCPResource({ server: 'srv', uri: 'file:///one' }),
    ).rejects.toThrow('does not support resource subscriptions')
  })

  test('resource updated notifications are observable and recorded in-app', () => {
    const events: unknown[] = []
    const unsubscribe = subscribeMcpResourceUpdated(event => {
      events.push(event)
    })

    notifyMcpResourceUpdated({ server: 'srv', uri: 'file:///one' })
    unsubscribe()
    notifyMcpResourceUpdated({ server: 'srv', uri: 'file:///two' })

    expect(events).toEqual([{ server: 'srv', uri: 'file:///one' }])
    expect(getNotifications().map(n => n.channel)).toEqual([
      'mcp:resource-updated',
      'mcp:resource-updated',
    ])
    expect(getNotifications()[0]).toMatchObject({
      title: 'MCP resource updated',
      message: 'srv: file:///one',
      kind: 'info',
      source: 'system',
    })
  })
})
