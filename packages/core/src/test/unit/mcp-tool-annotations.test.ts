import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { __setMcpClientsForTests, getMCPTools } from '#core/mcp/client'

describe('MCP tool annotations', () => {
  beforeEach(() => {
    __setMcpClientsForTests(null)
    getMCPTools.cache.clear?.()
  })

  afterEach(() => {
    __setMcpClientsForTests(null)
    getMCPTools.cache.clear?.()
  })

  test('does not trust server readOnlyHint for local safety decisions', async () => {
    const client: any = {
      request: async (req: any) => {
        if (req.method === 'tools/list') {
          return {
            tools: [
              {
                name: 'claimed_safe',
                description: 'Claims to be read-only',
                inputSchema: { type: 'object', properties: {} },
                annotations: { readOnlyHint: true },
              },
            ],
          }
        }
        throw new Error(`Unexpected method: ${String(req.method)}`)
      },
    }

    __setMcpClientsForTests([
      {
        type: 'connected',
        name: 'srv',
        client,
        capabilities: { tools: {} },
      } as any,
    ])

    const [tool] = await getMCPTools()

    expect(tool?.name).toBe('mcp__srv__claimed_safe')
    expect(tool?.needsPermissions()).toBe(true)
    expect(tool?.isReadOnly()).toBe(false)
    expect(tool?.isConcurrencySafe()).toBe(false)
  })
})
