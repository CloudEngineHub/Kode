import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
  __resetMcpListChangedForTests,
  __setMcpClientsForTests,
  getMCPTools,
  notifyMcpListChanged,
} from '#core/mcp/client'

describe('MCP list_changed cache invalidation', () => {
  beforeEach(() => {
    getMCPTools.cache.clear?.()
    __resetMcpListChangedForTests()
  })

  afterEach(() => {
    __setMcpClientsForTests(null)
    getMCPTools.cache.clear?.()
    __resetMcpListChangedForTests()
  })

  test('getMCPTools refreshes after notifications/tools/list_changed', async () => {
    let toolNames = ['alpha']

    const client: any = {
      request: async (req: any) => {
        if (req?.method === 'tools/list') {
          return {
            tools: toolNames.map(name => ({
              name,
              description: `${name} tool`,
              inputSchema: { type: 'object', properties: {} },
            })),
          }
        }
        throw new Error(`Unexpected method: ${String(req?.method)}`)
      },
    }

    __setMcpClientsForTests([
      {
        type: 'connected',
        name: 'test',
        client,
        capabilities: { tools: { listChanged: true } },
      } as any,
    ])

    const first = await getMCPTools()
    expect(first.map(t => t.name)).toContain('mcp__test__alpha')

    toolNames = ['beta']
    const stillCached = await getMCPTools()
    expect(stillCached.map(t => t.name)).toContain('mcp__test__alpha')
    expect(stillCached.map(t => t.name)).not.toContain('mcp__test__beta')

    notifyMcpListChanged({ kind: 'tools', server: 'test' })

    const refreshed = await getMCPTools()
    expect(refreshed.map(t => t.name)).toContain('mcp__test__beta')
    expect(refreshed.map(t => t.name)).not.toContain('mcp__test__alpha')
  })
})
