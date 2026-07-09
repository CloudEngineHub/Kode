import { afterEach, describe, expect, test } from 'bun:test'

import { __setMcpClientsForTests, completeMCPArgument } from '#core/mcp/client'

describe('MCP completions', () => {
  afterEach(() => {
    __setMcpClientsForTests(null)
  })

  test('completeMCPArgument calls completion/complete with prompt context', async () => {
    const requests: unknown[] = []
    const client: any = {
      complete: async (params: unknown) => {
        requests.push(params)
        return {
          completion: {
            values: ['python', 'pytorch'],
            total: 2,
            hasMore: false,
          },
        }
      },
    }

    __setMcpClientsForTests([
      {
        type: 'connected',
        name: 'srv',
        client,
        capabilities: { completions: {} },
      } as any,
    ])

    const completion = await completeMCPArgument({
      server: 'srv',
      ref: { type: 'ref/prompt', name: 'code_review' },
      argument: { name: 'language', value: 'py' },
      context: { arguments: { framework: 'flask' } },
    })

    expect(completion).toEqual({
      values: ['python', 'pytorch'],
      total: 2,
      hasMore: false,
    })
    expect(requests).toEqual([
      {
        ref: { type: 'ref/prompt', name: 'code_review' },
        argument: { name: 'language', value: 'py' },
        context: { arguments: { framework: 'flask' } },
      },
    ])
  })

  test('completeMCPArgument rejects servers without completions capability', async () => {
    __setMcpClientsForTests([
      {
        type: 'connected',
        name: 'srv',
        client: {},
        capabilities: {},
      } as any,
    ])

    await expect(
      completeMCPArgument({
        server: 'srv',
        ref: { type: 'ref/resource', uri: 'file:///{path}' },
        argument: { name: 'path', value: 'src' },
      }),
    ).rejects.toThrow('does not support completions')
  })
})
