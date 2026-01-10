import { describe, expect, test } from 'bun:test'
import { ListMcpResourcesTool } from '#tools/tools/mcp/ListMcpResourcesTool/ListMcpResourcesTool'
import { ReadMcpResourceTool } from '#tools/tools/mcp/ReadMcpResourceTool/ReadMcpResourceTool'
import type { ToolUseContext } from '#core/tooling/Tool'

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

const makeContext = (mcpClients: unknown[]): ToolUseContext => ({
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
})

describe('MCP resource tools parity: use context.options.mcpClients', () => {
  test('ListMcpResourcesTool lists resources from connected clients in context', async () => {
    const fakeClient = {
      request: async () => ({
        resources: [{ uri: 'uri://one', name: 'one' }],
      }),
      getServerCapabilities: () => ({ resources: { listChanged: true } }),
    }

    const ctx = makeContext([
      {
        type: 'connected',
        name: 'srv',
        capabilities: { resources: { listChanged: true } },
        client: fakeClient,
      },
    ])

    const gen = ListMcpResourcesTool.call({}, ctx)
    const first = await gen.next()
    const firstValue = asRecord(first.value)
    expect(firstValue?.type).toBe('result')
    const data = Array.isArray(firstValue?.data) ? firstValue?.data : []
    expect(data).toHaveLength(1)
    expect(data[0]).toMatchObject({
      uri: 'uri://one',
      name: 'one',
      server: 'srv',
    })
  })

  test('ReadMcpResourceTool reads resources using context.options.mcpClients', async () => {
    const fakeClient = {
      request: async () => ({
        contents: [{ uri: 'uri://one', text: 'hello' }],
      }),
      getServerCapabilities: () => ({ resources: { listChanged: true } }),
    }

    const ctx = makeContext([
      {
        type: 'connected',
        name: 'srv',
        capabilities: { resources: { listChanged: true } },
        client: fakeClient,
      },
    ])

    const gen = ReadMcpResourceTool.call(
      { server: 'srv', uri: 'uri://one' },
      ctx,
    )
    const first = await gen.next()
    const firstValue = asRecord(first.value)
    expect(firstValue?.type).toBe('result')
    expect(firstValue?.data).toMatchObject({
      contents: [{ uri: 'uri://one', text: 'hello' }],
    })
  })
})
