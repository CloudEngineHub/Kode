import { expect, test } from 'bun:test'

import { messagesToAgentEvents } from '#core/query'
import type { Message } from '#core/query'

test('messagesToAgentEvents converts message stream to AgentEvent stream', async () => {
  const sessionId = 's1'

  async function* source() {
    yield {
      type: 'user',
      uuid: 'u1',
      message: { role: 'user', content: 'hi' },
    } as unknown as Message

    yield { type: 'progress' } as unknown as Message

    yield {
      type: 'assistant',
      uuid: 'a1',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'server_tool_use',
            id: 't1',
            name: 'Bash',
            input: { command: 'echo 1' },
          },
          { type: 'text', text: 'ok' },
        ],
      },
    } as unknown as Message
  }

  const events: any[] = []
  for await (const e of messagesToAgentEvents({
    source: source(),
    sessionId,
  })) {
    events.push(e)
  }

  expect(events).toEqual([
    {
      type: 'user',
      session_id: sessionId,
      uuid: 'u1',
      parent_tool_use_id: null,
      message: { role: 'user', content: 'hi' },
    },
    {
      type: 'assistant',
      session_id: sessionId,
      uuid: 'a1',
      parent_tool_use_id: null,
      message: {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 't1',
            name: 'Bash',
            input: { command: 'echo 1' },
          },
          { type: 'text', text: 'ok' },
        ],
      },
    },
  ])
})
