import { describe, expect, test } from 'bun:test'
import type { AgentEvent, PermissionRequestEvent } from '@kode/protocol'

import { __workspaceDashboardForTests } from './WorkspaceDashboard'

const permissionRequest: PermissionRequestEvent = {
  type: 'permission_request',
  request_id: 'perm-1',
  tool_name: 'Shell',
  tool_description: 'Run a shell command',
  input: {},
}

describe('WorkspaceDashboard helpers', () => {
  test('summarizes event categories for runtime overview', () => {
    const events: AgentEvent[] = [
      {
        type: 'user',
        uuid: 'user-1',
        message: { role: 'user', content: 'hello' },
      },
      {
        type: 'assistant',
        uuid: 'assistant-1',
        message: { role: 'assistant', content: [{ type: 'text', text: 'hi' }] },
      },
      {
        type: 'stream_event',
        uuid: 'stream-1',
        session_id: 'session',
        event: { type: 'mcp_progress' },
      },
      {
        type: 'log',
        log: { level: 'error', message: 'socket closed' },
      },
      {
        type: 'result',
        subtype: 'success',
        session_id: 'session',
        result: '',
        num_turns: 1,
        total_cost_usd: 0,
        duration_ms: 12,
        duration_api_ms: 10,
        is_error: false,
      },
    ]

    expect(__workspaceDashboardForTests.summarizeAgentEvents(events)).toEqual({
      messages: 2,
      tools: 1,
      errors: 1,
      results: 1,
    })
  })

  test('prioritizes permission state over running state', () => {
    expect(
      __workspaceDashboardForTests.getRuntimePhase({
        connected: true,
        running: true,
        permissionRequest,
      }),
    ).toBe('permission')
  })

  test('distinguishes runtime attachment from backend availability', () => {
    const detached = __workspaceDashboardForTests.getRuntimePhase({
      connected: false,
      running: false,
      permissionRequest: null,
    })
    const attached = __workspaceDashboardForTests.getRuntimePhase({
      connected: true,
      running: false,
      permissionRequest: null,
    })

    expect(detached).toBe('detached')
    expect(__workspaceDashboardForTests.phaseLabel(detached)).toBe('Detached')
    expect(__workspaceDashboardForTests.phaseTone(detached)).toBe('muted')
    expect(__workspaceDashboardForTests.phaseBadgeVariant(detached)).toBe(
      'secondary',
    )

    expect(attached).toBe('attached')
    expect(__workspaceDashboardForTests.phaseLabel(attached)).toBe('Attached')
    expect(__workspaceDashboardForTests.phaseTone(attached)).toBe('success')
    expect(__workspaceDashboardForTests.phaseBadgeVariant(attached)).toBe(
      'success',
    )
  })

  test('uses stable compact labels', () => {
    expect(__workspaceDashboardForTests.shortId('1234567890')).toBe('12345678')
    expect(__workspaceDashboardForTests.sessionTitle(null)).toBe('New session')
  })
})
