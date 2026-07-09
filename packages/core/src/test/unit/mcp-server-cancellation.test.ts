import { describe, expect, test } from 'bun:test'

import {
  __convertToolPayloadToMcpContentForTests,
  __createLinkedMcpAbortControllerForTests,
  __createMcpProgressReporterForTests,
} from '#core/mcp/server'
import { createAssistantMessage } from '#core/utils/messages'

describe('MCP server cancellation', () => {
  test('converts tool text and image payload blocks to MCP content blocks', () => {
    const content = __convertToolPayloadToMcpContentForTests({
      payload: [
        { type: 'text', text: 'hello' },
        {
          type: 'image',
          source: {
            type: 'base64',
            data: 'aW1hZ2U=',
            media_type: 'image/png',
          },
        },
      ],
      fallback: 'fallback',
    })

    expect(content).toEqual([
      { type: 'text', text: 'hello' },
      { type: 'image', data: 'aW1hZ2U=', mimeType: 'image/png' },
    ])
  })

  test('preserves MCP-native media and resource payload blocks', () => {
    const content = __convertToolPayloadToMcpContentForTests({
      payload: [
        { type: 'audio', data: 'YXVkaW8=', mimeType: 'audio/wav' },
        {
          type: 'resource_link',
          uri: 'file:///tmp/a.txt',
          name: 'a.txt',
          description: 'Temporary file',
          mimeType: 'text/plain',
        },
        {
          type: 'resource',
          resource: {
            uri: 'file:///tmp/b.txt',
            mimeType: 'text/plain',
            text: 'embedded text',
          },
        },
        {
          type: 'resource',
          resource: {
            uri: 'file:///tmp/c.bin',
            mimeType: 'application/octet-stream',
            blob: 'AAEC',
          },
        },
      ],
      fallback: 'fallback',
    })

    expect(content).toEqual([
      {
        type: 'audio',
        data: 'YXVkaW8=',
        mimeType: 'audio/wav',
      },
      {
        type: 'resource_link',
        uri: 'file:///tmp/a.txt',
        name: 'a.txt',
        description: 'Temporary file',
        mimeType: 'text/plain',
      },
      {
        type: 'resource',
        resource: {
          uri: 'file:///tmp/b.txt',
          mimeType: 'text/plain',
          text: 'embedded text',
        },
      },
      {
        type: 'resource',
        resource: {
          uri: 'file:///tmp/c.bin',
          mimeType: 'application/octet-stream',
          blob: 'AAEC',
        },
      },
    ])
  })

  test('keeps unknown tool payload blocks inspectable as text', () => {
    const content = __convertToolPayloadToMcpContentForTests({
      payload: [{ type: 'custom_content', uri: 'file:///tmp/a.txt' }],
      fallback: 'fallback',
    })

    expect(content).toEqual([
      {
        type: 'text',
        text: '{"type":"custom_content","uri":"file:///tmp/a.txt"}',
      },
    ])
  })

  test('preserves legacy string and fallback behavior for MCP tool results', () => {
    expect(
      __convertToolPayloadToMcpContentForTests({
        payload: 'plain result',
        fallback: 'fallback',
      }),
    ).toEqual([{ type: 'text', text: 'plain result' }])

    expect(
      __convertToolPayloadToMcpContentForTests({
        payload: { ignored: true },
        fallback: { output: 1 },
      }),
    ).toEqual([{ type: 'text', text: '{"output":1}' }])
  })

  test('links MCP request abort signals into tool abort controllers', () => {
    const requestAbort = new AbortController()
    const linked = __createLinkedMcpAbortControllerForTests(requestAbort.signal)

    requestAbort.abort('client cancelled')

    expect(linked.abortController.signal.aborted).toBe(true)
    expect(linked.abortController.signal.reason).toBe('client cancelled')

    linked.cleanup()
  })

  test('does not propagate after cleanup', () => {
    const requestAbort = new AbortController()
    const linked = __createLinkedMcpAbortControllerForTests(requestAbort.signal)

    linked.cleanup()
    requestAbort.abort('late cancellation')

    expect(linked.abortController.signal.aborted).toBe(false)
  })

  test('sends MCP progress notifications when the request includes a progress token', async () => {
    const notifications: unknown[] = []
    const reporter = __createMcpProgressReporterForTests(
      {
        _meta: { progressToken: 'tool-progress-token' },
        sendNotification: async notification => {
          notifications.push(notification)
        },
      },
      'Bash',
    )

    await reporter({
      type: 'progress',
      content: createAssistantMessage(
        '<tool-progress>Running\u001B[2J command</tool-progress>',
      ),
    })

    expect(notifications).toEqual([
      {
        method: 'notifications/progress',
        params: {
          progressToken: 'tool-progress-token',
          progress: 1,
          message: 'Running command',
        },
      },
    ])
  })

  test('does not send MCP progress notifications without a progress token', async () => {
    const notifications: unknown[] = []
    const reporter = __createMcpProgressReporterForTests(
      {
        sendNotification: async notification => {
          notifications.push(notification)
        },
      },
      'Bash',
    )

    await reporter({
      type: 'progress',
      content: createAssistantMessage('<tool-progress>Running</tool-progress>'),
    })

    expect(notifications).toEqual([])
  })
})
