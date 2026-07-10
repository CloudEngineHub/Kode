import { describe, expect, test } from 'bun:test'

import { parseClientWsMessage } from './events'

describe('daemon WebSocket correlation inputs', () => {
  test('accepts and preserves a valid clientMessageUuid on prompts', () => {
    expect(
      parseClientWsMessage(
        Buffer.from(
          JSON.stringify({
            type: 'prompt',
            prompt: 'hello',
            clientMessageUuid: '11111111-1111-4111-8111-111111111111',
          }),
        ),
      ),
    ).toEqual({
      ok: true,
      value: {
        type: 'prompt',
        prompt: 'hello',
        clientMessageUuid: '11111111-1111-4111-8111-111111111111',
      },
    })
  })

  test('rejects malformed correlation identifiers', () => {
    expect(
      parseClientWsMessage(
        Buffer.from(
          JSON.stringify({
            type: 'prompt',
            prompt: 'hello',
            clientMessageUuid: 'not-a-uuid',
          }),
        ),
      ),
    ).toEqual({ ok: false, error: 'Invalid clientMessageUuid' })

    expect(
      parseClientWsMessage(
        Buffer.from(JSON.stringify({ type: 'cancel', turnId: 'not-a-uuid' })),
      ),
    ).toEqual({ ok: false, error: 'Invalid turnId' })
  })

  test('carries optional turn and client selectors on cancellation', () => {
    expect(
      parseClientWsMessage(
        Buffer.from(
          JSON.stringify({
            type: 'cancel',
            turnId: '22222222-2222-4222-8222-222222222222',
            clientMessageUuid: '33333333-3333-4333-8333-333333333333',
          }),
        ),
      ),
    ).toEqual({
      ok: true,
      value: {
        type: 'cancel',
        turnId: '22222222-2222-4222-8222-222222222222',
        clientMessageUuid: '33333333-3333-4333-8333-333333333333',
      },
    })
  })
})
