import { describe, expect, test } from 'bun:test'
import type { AgentEvent } from '@kode/protocol'

import { __chatPageForTests } from './Chat'

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
      mcpProgressEvent({ uuid: 'progress-1', toolUseId: 'tool-a', progress: 1 }),
      mcpProgressEvent({ uuid: 'progress-2', toolUseId: 'tool-a', progress: 2 }),
      mcpProgressEvent({ uuid: 'progress-3', toolUseId: 'tool-b', progress: 1 }),
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
})
