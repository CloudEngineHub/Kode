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

  test('bridges SDK tool progress callbacks to UI progress and stream events', async () => {
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
    const progress = await gen.next()
    const result = await gen.next()

    if (progress.done || (progress.value as any)?.type !== 'progress') {
      throw new Error('Expected first MCP tool update to be progress')
    }
    if (result.done || (result.value as any)?.type !== 'result') {
      throw new Error('Expected second MCP tool update to be result')
    }

    const progressValue = progress.value as {
      type: 'progress'
      content: any
    }
    const resultValue = result.value as {
      type: 'result'
      data: unknown
    }

    expect(progressValue.type).toBe('progress')
    const progressText =
      progressValue.content?.message?.content?.[0]?.type === 'text'
        ? progressValue.content.message.content[0].text
        : ''
    expect(progressText).toBe(
      '<tool-progress>MCP srv/slow: halfway (1/2)</tool-progress>',
    )
    expect(resultValue.type).toBe('result')
    expect(resultValue.data).toEqual([{ type: 'text', text: 'done' }])
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

  test('normalizes MCP progress text before emitting UI progress', async () => {
    const events: unknown[] = []
    const longMessage = `${'x'.repeat(260)}\u001B[2J\nnext line`
    const client: any = {
      request: async (req: any) => {
        if (req.method === 'tools/list') {
          return {
            tools: [
              {
                name: 'noisy',
                inputSchema: { type: 'object', properties: {} },
              },
            ],
          }
        }
        throw new Error(`Unexpected method: ${String(req.method)}`)
      },
      callTool: async (_request: unknown, _schema: unknown, options: any) => {
        options?.onprogress?.({
          progress: Number.NaN,
          total: Infinity,
          message: longMessage,
          extra: 'ignored',
        })
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
    const progress = await gen.next()

    if (progress.done || (progress.value as any)?.type !== 'progress') {
      throw new Error('Expected first MCP tool update to be progress')
    }

    const progressText =
      (progress.value as any).content?.message?.content?.[0]?.type === 'text'
        ? (progress.value as any).content.message.content[0].text
        : ''
    expect(progressText).not.toContain('\u001B')
    expect(progressText).toContain('...')
    expect(progressText).toContain('<tool-progress>MCP srv/noisy: ')

    expect(events).toHaveLength(1)
    const event = events[0] as any
    expect(event.progress.progress).toBeUndefined()
    expect(event.progress.total).toBeUndefined()
    expect(event.progress.extra).toBeUndefined()
    expect(event.progress.message).not.toContain('\u001B')
    expect(event.progress.message.length).toBeLessThanOrEqual(243)
  })
})
