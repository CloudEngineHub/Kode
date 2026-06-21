import { describe, expect, test } from 'bun:test'
import { convertAnthropicMessagesToOpenAIMessages } from '../../utils/openaiMessageConversion'

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

describe('openaiMessageConversion', () => {
  test('converts user image+text blocks and preserves tool call/result ordering', () => {
    const messages: Parameters<
      typeof convertAnthropicMessagesToOpenAIMessages
    >[0] = [
      {
        message: {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: 'Zm9v', // "foo" base64
              },
            },
            { type: 'text', text: 'What is in this image?' },
          ],
        },
      },
      {
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool_1',
              name: 'Read',
              input: { path: 'README.md' },
            },
          ],
        },
      },
      {
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool_1',
              content: 'file contents',
            },
          ],
        },
      },
      {
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Done' }],
        },
      },
    ]

    const converted = convertAnthropicMessagesToOpenAIMessages(messages)

    const user0 = asRecord(converted[0])
    expect(user0?.role).toBe('user')
    expect(Array.isArray(user0?.content)).toBe(true)
    const user0Content = user0?.content as unknown[]
    expect(user0Content[0]).toMatchObject({
      type: 'image_url',
      image_url: { url: 'data:image/png;base64,Zm9v' },
    })
    expect(user0Content[1]).toMatchObject({
      type: 'text',
      text: 'What is in this image?',
    })

    const assistant1 = asRecord(converted[1])
    expect(assistant1?.role).toBe('assistant')
    const toolCalls = assistant1?.tool_calls
    expect(Array.isArray(toolCalls)).toBe(true)
    expect((toolCalls as unknown[])[0]).toMatchObject({
      id: 'tool_1',
      type: 'function',
      function: { name: 'Read' },
    })

    const tool2 = asRecord(converted[2])
    expect(tool2?.role).toBe('tool')
    expect(tool2?.tool_call_id).toBe('tool_1')
    expect(tool2?.content).toBe('file contents')

    const assistant3 = asRecord(converted[3])
    expect(assistant3?.role).toBe('assistant')
    expect(assistant3?.content).toBe('Done')
  })
})
