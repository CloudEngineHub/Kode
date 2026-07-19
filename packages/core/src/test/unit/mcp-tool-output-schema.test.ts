import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { __setMcpClientsForTests, getMCPTools } from '#core/mcp/client'
import type { ToolUseContext } from '#core/tooling/Tool'

function createToolUseContext(): ToolUseContext {
  return {
    abortController: new AbortController(),
    messageId: 'message',
    toolUseId: 'tool-use',
    readFileTimestamps: {},
    options: {
      commands: [],
      tools: [],
      messageLogName: 'test',
      maxThinkingTokens: 0,
    },
  }
}

describe('MCP tool output schema', () => {
  beforeEach(() => {
    __setMcpClientsForTests(null)
    getMCPTools.cache.clear?.()
  })

  afterEach(() => {
    __setMcpClientsForTests(null)
    getMCPTools.cache.clear?.()
  })

  test('returns structuredContent after it matches the declared outputSchema', async () => {
    const client: any = {
      request: async (req: any) => {
        if (req.method === 'tools/list') {
          return {
            tools: [
              {
                name: 'structured',
                inputSchema: { type: 'object', properties: {} },
                outputSchema: {
                  type: 'object',
                  properties: {
                    answer: { type: 'number' },
                  },
                  required: ['answer'],
                },
              },
            ],
          }
        }
        throw new Error(`Unexpected method: ${String(req.method)}`)
      },
      callTool: async () => ({
        content: [{ type: 'text', text: '{"answer":42}' }],
        structuredContent: { answer: 42 },
      }),
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
    const first = await tool!.call({}, createToolUseContext()).next()

    expect(first.done).toBe(false)
    expect(first.value).toMatchObject({
      type: 'result',
      data: '{"answer":42}',
      resultForAssistant: '{"answer":42}',
    })
  })

  test('falls back to text content when structuredContent violates outputSchema', async () => {
    const client: any = {
      request: async (req: any) => {
        if (req.method === 'tools/list') {
          return {
            tools: [
              {
                name: 'structured',
                inputSchema: { type: 'object', properties: {} },
                outputSchema: {
                  type: 'object',
                  properties: {
                    answer: { type: 'number' },
                  },
                  required: ['answer'],
                },
              },
            ],
          }
        }
        throw new Error(`Unexpected method: ${String(req.method)}`)
      },
      callTool: async () => ({
        content: [{ type: 'text', text: '{"answer":"fallback"}' }],
        structuredContent: { answer: 'fallback' },
      }),
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
    const first = await tool!.call({}, createToolUseContext()).next()

    expect(first.done).toBe(false)
    expect(first.value).toMatchObject({
      type: 'result',
      data: [{ type: 'text', text: '{"answer":"fallback"}' }],
      resultForAssistant: [{ type: 'text', text: '{"answer":"fallback"}' }],
    })
  })
})
