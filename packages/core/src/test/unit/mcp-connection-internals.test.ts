import { afterEach, describe, expect, test } from 'bun:test'
import {
  createMcpTransportCandidates,
  getMcpConnectionTimeoutMs,
} from '#core/mcp/client/connection'
import { getMcpServerConnectionBatchSize } from '#core/mcp/client/settings'
import { getClients, getMCPCommands, getMCPTools } from '#core/mcp/client'

describe('MCP connection internals', () => {
  const originalBatchSize = process.env.MCP_SERVER_CONNECTION_BATCH_SIZE
  const originalTimeout = process.env.MCP_CONNECTION_TIMEOUT_MS

  afterEach(() => {
    if (originalBatchSize === undefined)
      delete process.env.MCP_SERVER_CONNECTION_BATCH_SIZE
    else process.env.MCP_SERVER_CONNECTION_BATCH_SIZE = originalBatchSize

    if (originalTimeout === undefined)
      delete process.env.MCP_CONNECTION_TIMEOUT_MS
    else process.env.MCP_CONNECTION_TIMEOUT_MS = originalTimeout
  })

  test('preserves transport fallback ordering for HTTP and SSE configs', async () => {
    const sseCandidates = await createMcpTransportCandidates({
      type: 'sse',
      url: 'http://127.0.0.1:3999/mcp',
      headers: { Authorization: 'Bearer token' },
    })
    expect(sseCandidates.map(candidate => candidate.kind)).toEqual([
      'sse',
      'http',
    ])

    const httpCandidates = await createMcpTransportCandidates({
      type: 'http',
      url: 'http://127.0.0.1:3999/mcp',
      headers: { Authorization: 'Bearer token' },
    })
    expect(httpCandidates.map(candidate => candidate.kind)).toEqual([
      'http',
      'sse',
    ])
  })

  test('uses stdio as a single transport candidate by default', async () => {
    const candidates = await createMcpTransportCandidates({
      command: process.execPath,
      args: ['--version'],
      env: { TEST_ENV: '1' },
    })

    expect(candidates.map(candidate => candidate.kind)).toEqual(['stdio'])
  })

  test('parses connection env vars without changing defaults', () => {
    delete process.env.MCP_SERVER_CONNECTION_BATCH_SIZE
    delete process.env.MCP_CONNECTION_TIMEOUT_MS
    expect(getMcpServerConnectionBatchSize()).toBe(3)
    expect(getMcpConnectionTimeoutMs()).toBe(30_000)

    process.env.MCP_SERVER_CONNECTION_BATCH_SIZE = '7'
    process.env.MCP_CONNECTION_TIMEOUT_MS = '1234'
    expect(getMcpServerConnectionBatchSize()).toBe(7)
    expect(getMcpConnectionTimeoutMs()).toBe(1234)

    process.env.MCP_SERVER_CONNECTION_BATCH_SIZE = '0'
    process.env.MCP_CONNECTION_TIMEOUT_MS = 'not-a-number'
    expect(getMcpServerConnectionBatchSize()).toBe(3)
    expect(getMcpConnectionTimeoutMs()).toBe(30_000)
  })

  test('preserves cache.clear compatibility shims on public getters', () => {
    expect(typeof (getClients as any).cache?.clear).toBe('function')
    expect(typeof (getMCPTools as any).cache?.clear).toBe('function')
    expect(typeof (getMCPCommands as any).cache?.clear).toBe('function')
  })
})
