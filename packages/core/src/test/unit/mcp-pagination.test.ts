import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
  __setMcpClientsForTests,
  getMCPCommands,
  getMCPResourceTemplates,
  getMCPResources,
  getMCPTools,
} from '#core/mcp/client'
import { ListMcpResourcesTool } from '#tools/tools/mcp/ListMcpResourcesTool/ListMcpResourcesTool'
import type { ToolUseContext } from '#core/tooling/Tool'

function makeContext(mcpClients: unknown[]): ToolUseContext {
  return {
    abortController: new AbortController(),
    messageId: 'test',
    readFileTimestamps: {},
    options: {
      commands: [],
      tools: [],
      verbose: false,
      safeMode: false,
      forkNumber: 0,
      messageLogName: 'test',
      maxThinkingTokens: 0,
      mcpClients,
    },
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

describe('MCP paginated list requests', () => {
  beforeEach(() => {
    __setMcpClientsForTests(null)
    getMCPTools.cache.clear?.()
    getMCPCommands.cache.clear?.()
    getMCPResources.cache.clear?.()
    getMCPResourceTemplates.cache.clear?.()
  })

  afterEach(() => {
    __setMcpClientsForTests(null)
    getMCPTools.cache.clear?.()
    getMCPCommands.cache.clear?.()
    getMCPResources.cache.clear?.()
    getMCPResourceTemplates.cache.clear?.()
  })

  test('getMCPTools follows tools/list nextCursor pages', async () => {
    const requests: unknown[] = []
    const client: any = {
      request: async (req: any) => {
        requests.push(req)
        const cursor = req.params?.cursor
        if (!cursor) {
          return {
            tools: [
              {
                name: 'first',
                title: 'First Tool',
                inputSchema: { type: 'object', properties: {} },
                annotations: { title: 'Annotation Title' },
              },
            ],
            nextCursor: 'page-2',
          }
        }
        return {
          tools: [
            {
              name: 'second',
              inputSchema: { type: 'object', properties: {} },
            },
          ],
        }
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

    const tools = await getMCPTools()

    expect(tools.map(tool => tool.name)).toEqual([
      'mcp__srv__first',
      'mcp__srv__second',
    ])
    expect(tools.map(tool => tool.userFacingName())).toEqual([
      'srv - First Tool (MCP)',
      'srv - second (MCP)',
    ])
    expect(requests).toEqual([
      { method: 'tools/list' },
      { method: 'tools/list', params: { cursor: 'page-2' } },
    ])
  })

  test('getMCPCommands follows prompts/list nextCursor pages', async () => {
    const client: any = {
      request: async (req: any) => {
        const cursor = req.params?.cursor
        if (!cursor) {
          return {
            prompts: [{ name: 'first', description: 'first prompt' }],
            nextCursor: 'page-2',
          }
        }
        return {
          prompts: [{ name: 'second', description: 'second prompt' }],
        }
      },
    }

    __setMcpClientsForTests([
      {
        type: 'connected',
        name: 'srv',
        client,
        capabilities: { prompts: {} },
      } as any,
    ])

    const commands = await getMCPCommands()

    expect(commands.map(command => command.name)).toEqual([
      'mcp__srv__first',
      'mcp__srv__second',
    ])
  })

  test('ListMcpResourcesTool follows resources/list nextCursor pages', async () => {
    const client: any = {
      request: async (req: any) => {
        if (req.method === 'resources/templates/list') {
          return { resourceTemplates: [] }
        }
        const cursor = req.params?.cursor
        if (!cursor) {
          return {
            resources: [{ uri: 'file:///first', name: 'first' }],
            nextCursor: 'page-2',
          }
        }
        return {
          resources: [{ uri: 'file:///second', name: 'second' }],
        }
      },
      getServerCapabilities: () => ({ resources: {} }),
    }

    const ctx = makeContext([
      {
        type: 'connected',
        name: 'srv',
        client,
        capabilities: { resources: {} },
      },
    ])

    const gen = ListMcpResourcesTool.call({}, ctx)
    const first = await gen.next()
    const firstValue = asRecord(first.value)

    expect(firstValue?.type).toBe('result')
    expect(firstValue?.data).toEqual([
      { uri: 'file:///first', name: 'first', type: 'resource', server: 'srv' },
      {
        uri: 'file:///second',
        name: 'second',
        type: 'resource',
        server: 'srv',
      },
    ])
  })

  test('getMCPResources follows resources/list nextCursor pages', async () => {
    const client: any = {
      request: async (req: any) => {
        const cursor = req.params?.cursor
        if (!cursor) {
          return {
            resources: [{ uri: 'file:///first', name: 'first' }],
            nextCursor: 'page-2',
          }
        }
        return {
          resources: [{ uri: 'file:///second', name: 'second' }],
        }
      },
      getServerCapabilities: () => ({ resources: {} }),
    }

    __setMcpClientsForTests([
      {
        type: 'connected',
        name: 'srv',
        client,
        capabilities: { resources: {} },
      } as any,
    ])

    const resources = await getMCPResources()

    expect(resources).toEqual([
      { uri: 'file:///first', name: 'first', server: 'srv' },
      { uri: 'file:///second', name: 'second', server: 'srv' },
    ])
  })

  test('getMCPResourceTemplates follows resources/templates/list nextCursor pages', async () => {
    const requests: unknown[] = []
    const client: any = {
      request: async (req: any) => {
        requests.push(req)
        const cursor = req.params?.cursor
        if (!cursor) {
          return {
            resourceTemplates: [
              { uriTemplate: 'file:///{first}', name: 'first' },
            ],
            nextCursor: 'page-2',
          }
        }
        return {
          resourceTemplates: [
            { uriTemplate: 'file:///{second}', name: 'second' },
          ],
        }
      },
      getServerCapabilities: () => ({ resources: {} }),
    }

    __setMcpClientsForTests([
      {
        type: 'connected',
        name: 'srv',
        client,
        capabilities: { resources: {} },
      } as any,
    ])

    const templates = await getMCPResourceTemplates()

    expect(templates).toEqual([
      { uriTemplate: 'file:///{first}', name: 'first', server: 'srv' },
      { uriTemplate: 'file:///{second}', name: 'second', server: 'srv' },
    ])
    expect(requests).toEqual([
      { method: 'resources/templates/list' },
      { method: 'resources/templates/list', params: { cursor: 'page-2' } },
    ])
  })
})
