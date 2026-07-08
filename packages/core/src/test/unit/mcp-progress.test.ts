import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { __setMcpClientsForTests, getMCPTools } from '#core/mcp/client'
import type { ToolUseContext } from '#core/tooling/Tool'

describe('MCP progress notifications', () => {
  beforeEach(() => {
    __setMcpClientsForTests(null)
    getMCPTools.cache.clear?.()
  })

  afterEach(() => {
    __setMcpClientsForTests(null)
    getMCPTools.cache.clear?.()
  })

  test('bridges SDK tool progress callbacks to stream events', async () => {
    const events: unknown[] = []
    const client: any = {
      request: async (req: any) => {
        if (req.method === 'tools/list') {
          return {
            tools: [
              {
                name: 'slow',
                inputSchema: { type: 'object', properties: {} },
              },
            ],
          }
        }
        throw new Error(`Unexpected method: ${String(req.method)}`)
      },
      callTool: async (_request: unknown, _schema: unknown, options: any) => {
        options?.onprogress?.({ progress: 1, total: 2, message: 'halfway' })
        return { content: [{ type: 'text', text: 'done' }] }
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
    const ctx: ToolUseContext = {
      abortController: new AbortController(),
      messageId: 'message',
      toolUseId: 'tool-use',
      readFileTimestamps: {},
      options: {
        commands: [],
        tools: [],
        messageLogName: 'test',
        maxThinkingTokens: 0,
        onStreamEvent: event => events.push(event),
      },
    }

    const gen = tool!.call({}, ctx)
    await gen.next()

    expect(events).toEqual([
      {
        type: 'mcp_progress',
        server: 'srv',
        tool: 'slow',
        toolUseId: 'tool-use',
        progress: { progress: 1, total: 2, message: 'halfway' },
      },
    ])
  })
})
