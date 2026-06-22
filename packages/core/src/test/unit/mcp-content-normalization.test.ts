import { describe, expect, test } from 'bun:test'
import { runCommand } from '#core/mcp/client/commands'

describe('MCP content normalization', () => {
  test('runCommand converts MCP image prompt content to Anthropic image blocks', async () => {
    const client: any = {
      name: 'fixture',
      client: {
        async getPrompt() {
          return {
            messages: [
              {
                role: 'user',
                content: {
                  type: 'image',
                  data: 'abc123',
                  mimeType: 'image/jpeg',
                },
              },
            ],
          }
        },
      },
    }

    const messages = await runCommand({ name: 'screenshot', client }, {})

    expect(messages).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              data: 'abc123',
              media_type: 'image/jpeg',
            },
          },
        ],
      },
    ])
  })

  test('runCommand falls back to png when MCP image mime type is absent', async () => {
    const client: any = {
      name: 'fixture',
      client: {
        async getPrompt() {
          return {
            messages: [
              {
                role: 'assistant',
                content: {
                  type: 'image',
                  data: 'abc123',
                },
              },
            ],
          }
        },
      },
    }

    const messages = await runCommand({ name: 'screenshot', client }, {})

    expect((messages[0]!.content as any[])[0].source.media_type).toBe(
      'image/png',
    )
  })

  test('runCommand falls back to png when MCP image mime type is unsupported', async () => {
    const client: any = {
      name: 'fixture',
      client: {
        async getPrompt() {
          return {
            messages: [
              {
                role: 'user',
                content: {
                  type: 'image',
                  data: 'abc123',
                  mimeType: 'application/octet-stream',
                },
              },
            ],
          }
        },
      },
    }

    const messages = await runCommand({ name: 'screenshot', client }, {})

    expect((messages[0]!.content as any[])[0].source.media_type).toBe(
      'image/png',
    )
  })
})
