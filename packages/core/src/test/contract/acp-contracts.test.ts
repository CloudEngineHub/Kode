import { describe, expect, test } from 'bun:test'

import { JsonRpcPeer } from '#host-acp/jsonrpc'
import { KodeAcpAgent } from '#host-acp/kodeAcpAgent'
import * as Protocol from '#host-acp/protocol'

type JsonRpcMessage = {
  jsonrpc?: string
  id?: string | number | null
  method?: string
  params?: any
  result?: any
  error?: any
}

function createInMemoryAcp() {
  const peer = new JsonRpcPeer()
  const out: JsonRpcMessage[] = []

  peer.setSend(line => {
    try {
      out.push(JSON.parse(line))
    } catch {
      // ignore
    }
  })

  new KodeAcpAgent(peer)

  const request = async (msg: JsonRpcMessage) => {
    const before = out.length
    await peer.handleIncoming(msg)
    const next = out.slice(before)
    expect(next.length).toBeGreaterThan(0)
    return next[next.length - 1]!
  }

  return { request }
}

describe('ACP protocol contracts (in-memory)', () => {
  test('initialize returns stable capabilities', async () => {
    const acp = createInMemoryAcp()
    const res = await acp.request({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: Protocol.ACP_PROTOCOL_VERSION,
        clientCapabilities: { terminal: true },
        clientInfo: { name: 'test', version: '0.0.0' },
      } satisfies Protocol.InitializeParams,
    })

    expect(res.id).toBe(1)
    expect(res.error).toBeUndefined()
    expect(res.result?.protocolVersion).toBe(Protocol.ACP_PROTOCOL_VERSION)
    expect(res.result?.agentCapabilities?.loadSession).toBe(true)
    expect(
      res.result?.agentCapabilities?.promptCapabilities?.embeddedContext,
    ).toBe(true)
    expect(
      res.result?.agentCapabilities?.promptCapabilities?.embeddedContent,
    ).toBe(true)
    expect(res.result?.agentCapabilities?.mcpCapabilities?.http).toBe(true)
    expect(res.result?.agentCapabilities?.mcpCapabilities?.sse).toBe(true)
  })

  test('session/new validates params (missing cwd)', async () => {
    const acp = createInMemoryAcp()
    const res = await acp.request({
      jsonrpc: '2.0',
      id: 2,
      method: 'session/new',
      params: {
        mcpServers: [],
      } satisfies Partial<Protocol.NewSessionParams>,
    })

    expect(res.id).toBe(2)
    expect(res.result).toBeUndefined()
    expect(res.error?.code).toBe(-32602)
    expect(String(res.error?.message)).toContain('Missing required param: cwd')
  })

  test('session/new validates params (cwd must be absolute)', async () => {
    const acp = createInMemoryAcp()
    const res = await acp.request({
      jsonrpc: '2.0',
      id: 3,
      method: 'session/new',
      params: {
        cwd: 'relative/path',
        mcpServers: [],
      } satisfies Partial<Protocol.NewSessionParams>,
    })

    expect(res.id).toBe(3)
    expect(res.result).toBeUndefined()
    expect(res.error?.code).toBe(-32602)
    expect(String(res.error?.message)).toContain('cwd must be an absolute path')
  })
})
