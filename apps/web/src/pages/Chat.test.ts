import { describe, expect, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AgentEvent } from '@kode/protocol'

import { ChatPage, __chatPageForTests } from './Chat'

function mcpProgressEvent(args: {
  uuid: string
  toolUseId: string
  progress: number
  server?: string
  tool?: string
}): AgentEvent {
  return {
    type: 'stream_event',
    uuid: args.uuid,
    session_id: 'session',
    parent_tool_use_id: args.toolUseId,
    event: {
      type: 'mcp_progress',
      server: args.server ?? 'srv',
      tool: args.tool ?? 'slow',
      toolUseId: args.toolUseId,
      progress: {
        progress: args.progress,
        total: 3,
        message: `step ${args.progress}`,
      },
    },
  }
}

describe('ChatPage event normalization', () => {
  test('coalesces repeated MCP progress events by tool use', () => {
    const events: AgentEvent[] = [
      {
        type: 'user',
        session_id: 'session',
        uuid: 'user-1',
        parent_tool_use_id: null,
        message: { role: 'user', content: 'run tool' },
      },
      mcpProgressEvent({
        uuid: 'progress-1',
        toolUseId: 'tool-a',
        progress: 1,
      }),
      mcpProgressEvent({
        uuid: 'progress-2',
        toolUseId: 'tool-a',
        progress: 2,
      }),
      mcpProgressEvent({
        uuid: 'progress-3',
        toolUseId: 'tool-b',
        progress: 1,
      }),
    ]

    const normalized = __chatPageForTests.getChatEventsForRender(events)

    expect(normalized.map(event => event.type)).toEqual([
      'user',
      'stream_event',
      'stream_event',
    ])
    expect((normalized[1] as any).uuid).toBe('progress-2')
    expect((normalized[2] as any).uuid).toBe('progress-3')
    expect(__chatPageForTests.getEventKey(normalized[1]!, 1)).toBe(
      'stream_event-mcp_progress-tool-a',
    )
  })

  test('includes system and permission events in terminal render order', () => {
    const events: AgentEvent[] = [
      {
        type: 'system',
        subtype: 'init',
        session_id: 'session',
        cwd: 'C:\\repo',
      },
    ]
    const permission = {
      type: 'permission_request' as const,
      request_id: 'perm-1',
      tool_name: 'Shell',
      tool_description: 'Run command',
      input: {},
    }

    const normalized = __chatPageForTests.getChatEventsForRender(events)
    const visible = __chatPageForTests.appendPermissionRequestEvent(
      normalized,
      permission,
    )

    expect(visible.map(event => event.type)).toEqual([
      'system',
      'permission_request',
    ])
    expect(__chatPageForTests.getEventKey(visible[1]!, 1)).toBe(
      'permission_request-perm-1',
    )
    expect(
      __chatPageForTests.appendPermissionRequestEvent(visible, permission),
    ).toHaveLength(2)
  })

  test('detects sticky bottom scroll state with a small threshold', () => {
    expect(
      __chatPageForTests.isNearScrollBottom({
        scrollTop: 928,
        clientHeight: 400,
        scrollHeight: 1400,
      }),
    ).toBe(true)

    expect(
      __chatPageForTests.isNearScrollBottom({
        scrollTop: 800,
        clientHeight: 400,
        scrollHeight: 1400,
      }),
    ).toBe(false)
  })

  test('renders a terminal transcript controlled by the prompt input', () => {
    const html = renderToStaticMarkup(
      React.createElement(ChatPage, {
        events: [],
        input: '',
        onInputChange: () => {},
        onSend: () => {},
        runtimeAttached: true,
        permissionRequest: {
          type: 'permission_request',
          request_id: 'perm-1',
          tool_name: 'Shell',
          tool_description: 'Run command',
          input: {},
        },
        sessionTitle: 'New session',
        workspacePath: 'C:\\repo',
      }),
    )
    const controlsMatch = html.match(/<textarea[^>]+aria-controls="([^"]+)"/)

    expect(controlsMatch?.[1]).toBeTruthy()
    expect(html).toContain(`id="${controlsMatch?.[1]}"`)
    expect(html).toContain('role="log"')
    expect(html).toContain('Permission pending')
    expect(html).toContain('Enter')
    expect(html).toContain('/help')
    expect(__chatPageForTests.chatTerminalHints.map(hint => hint.key)).toEqual([
      'Enter',
      'Shift+Enter',
      '/help',
      '@file',
      'Scroll',
    ])
  })
})
