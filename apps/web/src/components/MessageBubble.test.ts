import { describe, expect, test } from 'bun:test'

import { __messageBubbleForTests } from './MessageBubble'

describe('MessageBubble terminal transcript helpers', () => {
  test('maps message kinds to terminal role markers', () => {
    expect(__messageBubbleForTests.terminalKindMeta('user')).toMatchObject({
      label: 'user',
      marker: '$',
    })
    expect(__messageBubbleForTests.terminalKindMeta('assistant')).toMatchObject(
      {
        label: 'kode',
        marker: '>',
      },
    )
    expect(__messageBubbleForTests.terminalKindMeta('error')).toMatchObject({
      label: 'error',
      marker: '!',
    })
    expect(__messageBubbleForTests.terminalKindMeta('system')).toMatchObject({
      label: 'system',
      marker: '*',
    })
  })

  test('keeps system, permission, and generic stream events visible', () => {
    const system = __messageBubbleForTests.toBubbleMessage({
      type: 'system',
      subtype: 'init',
      cwd: 'C:\\repo',
      model: 'mimo',
      tools: ['Read', 'Edit'],
    })
    expect(system?.kind).toBe('system')
    expect(system?.text.includes('System')).toBe(true)

    expect(
      __messageBubbleForTests.toBubbleMessage({
        type: 'stream_event',
        session_id: 'session',
        event: { type: 'agent_status' },
      }),
    ).toMatchObject({
      kind: 'tool',
      text: '**Stream event**: `agent_status`',
    })

    const permission = __messageBubbleForTests.toBubbleMessage({
      type: 'permission_request',
      request_id: 'perm-1',
      tool_name: 'Shell',
      tool_description: 'Run command',
      input: {},
    })
    expect(permission?.kind).toBe('tool')
    expect(permission?.text.includes('Permission pending')).toBe(true)
  })
})
