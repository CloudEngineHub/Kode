import { describe, expect, test } from 'bun:test'
import { AcpError, toJsonRpcError } from '#host-acp/errors'
import { JsonRpcPeer } from '#host-acp/jsonrpc'
import { MAX_JSON_PAYLOAD_BYTES } from '#host-acp/validation'

function nestedObject(depth: number): Record<string, unknown> {
  let value: Record<string, unknown> = {}
  for (let i = 0; i < depth; i += 1) {
    value = { child: value }
  }
  return value
}

describe('ACP JSON-RPC validation', () => {
  test('rejects oversized inbound params with structured error data', async () => {
    const peer = new JsonRpcPeer()
    const lines: string[] = []
    peer.setSend(line => lines.push(line))
    peer.registerMethod('session/prompt', () => ({}))

    await peer.handleIncoming({
      jsonrpc: '2.0',
      id: 1,
      method: 'session/prompt',
      params: { text: 'x'.repeat(MAX_JSON_PAYLOAD_BYTES + 1) },
    })

    const response = JSON.parse(lines[0]!)
    expect(response.error.code).toBe(-32602)
    expect(response.error.data.kind).toBe('payload_too_large')
    expect(response.error.data.retryable).toBe(false)
  })

  test('rejects deeply nested inbound params with structured error data', async () => {
    const peer = new JsonRpcPeer()
    const lines: string[] = []
    peer.setSend(line => lines.push(line))
    peer.registerMethod('session/new', () => ({}))

    await peer.handleIncoming({
      jsonrpc: '2.0',
      id: 2,
      method: 'session/new',
      params: nestedObject(11),
    })

    const response = JSON.parse(lines[0]!)
    expect(response.error.code).toBe(-32602)
    expect(response.error.data.kind).toBe('payload_too_deep')
  })

  test('removes abort listeners when outbound request resolves', async () => {
    const peer = new JsonRpcPeer()
    const lines: string[] = []
    peer.setSend(line => lines.push(line))

    const controller = new AbortController()
    const signal = controller.signal
    const add = signal.addEventListener.bind(signal)
    const remove = signal.removeEventListener.bind(signal)
    let addCount = 0
    let removeCount = 0

    signal.addEventListener = ((...args: Parameters<typeof add>) => {
      addCount += 1
      return add(...args)
    }) as typeof signal.addEventListener
    signal.removeEventListener = ((...args: Parameters<typeof remove>) => {
      removeCount += 1
      return remove(...args)
    }) as typeof signal.removeEventListener

    const pending = peer.sendRequest<string>({
      method: 'client/test',
      signal,
      timeoutMs: 10_000,
    })
    const outbound = JSON.parse(lines[0]!)

    await peer.handleIncoming({
      jsonrpc: '2.0',
      id: outbound.id,
      result: 'ok',
    })

    await expect(pending).resolves.toBe('ok')
    expect(addCount).toBe(1)
    expect(removeCount).toBe(1)
  })
})

describe('AcpError mapping', () => {
  test('converts to JsonRpcError while preserving optional data', () => {
    const mapped = toJsonRpcError(
      new AcpError(-32602, 'Invalid ACP params', {
        kind: 'invalid_params',
        retryable: false,
        sessionId: 'sess_1',
      }),
    )

    expect(mapped.code).toBe(-32602)
    expect(mapped.message).toBe('Invalid ACP params')
    expect(mapped.data).toEqual({
      kind: 'invalid_params',
      retryable: false,
      sessionId: 'sess_1',
    })
  })
})
