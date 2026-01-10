import type { Buffer } from 'node:buffer'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { ServerCapabilities } from '@modelcontextprotocol/sdk/types.js'

import { MACRO } from '#core/constants/macros'
import { PRODUCT_COMMAND } from '#core/constants/product'
import { logError, logMCPError } from '#core/utils/log'
import type { WrappedClient } from '#core/mcp/client'

import type * as Protocol from '../protocol'

type Candidate =
  | { kind: 'stdio'; transport: StdioClientTransport }
  | { kind: 'http'; transport: StreamableHTTPClientTransport }
  | { kind: 'sse'; transport: SSEClientTransport }

function getConnectionTimeoutMs(): number {
  const rawTimeout = process.env.MCP_CONNECTION_TIMEOUT_MS
  const parsedTimeout = rawTimeout ? Number.parseInt(rawTimeout, 10) : NaN
  return Number.isFinite(parsedTimeout) ? parsedTimeout : 30_000
}

function buildEnv(extra?: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') env[key] = value
  }
  if (extra) Object.assign(env, extra)
  return env
}

function normalizeHeaders(
  headers: Protocol.HttpHeader[] | undefined,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const h of headers ?? []) {
    if (!h || typeof h !== 'object') continue
    if (typeof h.name === 'string' && typeof h.value === 'string') {
      out[h.name] = h.value
    }
  }
  return out
}

function normalizeEnvVars(
  vars: Protocol.EnvVariable[] | undefined,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const v of vars ?? []) {
    if (!v || typeof v !== 'object') continue
    if (typeof v.name === 'string' && typeof v.value === 'string') {
      out[v.name] = v.value
    }
  }
  return out
}

async function connectWithTimeout(
  client: Client,
  transport: Transport,
  name: string,
  timeoutMs: number,
): Promise<void> {
  const connectPromise = client.connect(transport)
  if (timeoutMs <= 0) {
    await connectPromise
    return
  }

  const timeoutPromise = new Promise<never>((_, reject) => {
    const timeoutId = setTimeout(() => {
      reject(
        new Error(
          `Connection to MCP server "${name}" timed out after ${timeoutMs}ms`,
        ),
      )
    }, timeoutMs)

    connectPromise.finally(() => clearTimeout(timeoutId))
  })

  await Promise.race([connectPromise, timeoutPromise])
}

function createCandidates(server: Protocol.McpServer): {
  name: string
  candidates: Candidate[]
} | null {
  const name = server.name
  if (!name) return null

  if (server.type === 'http' || server.type === 'sse') {
    const url = server.url
    if (!url) return null

    let parsedUrl: URL
    try {
      parsedUrl = new URL(url)
    } catch (e) {
      logError(e)
      return null
    }

    const headers = normalizeHeaders(server.headers)
    const options =
      Object.keys(headers).length > 0 ? { requestInit: { headers } } : undefined

    if (server.type === 'http') {
      return {
        name,
        candidates: [
          {
            kind: 'http',
            transport: new StreamableHTTPClientTransport(parsedUrl, options),
          },
          {
            kind: 'sse',
            transport: new SSEClientTransport(parsedUrl, options),
          },
        ],
      }
    }

    return {
      name,
      candidates: [
        { kind: 'sse', transport: new SSEClientTransport(parsedUrl, options) },
        {
          kind: 'http',
          transport: new StreamableHTTPClientTransport(parsedUrl, options),
        },
      ],
    }
  }

  const envFromParams = normalizeEnvVars(server.env)
  return {
    name,
    candidates: [
      {
        kind: 'stdio',
        transport: new StdioClientTransport({
          command: server.command,
          args: server.args,
          env: buildEnv(envFromParams),
          stderr: 'pipe',
        }),
      },
    ],
  }
}

export async function connectAcpMcpServers(
  mcpServers: Protocol.McpServer[],
): Promise<WrappedClient[]> {
  if (!Array.isArray(mcpServers) || mcpServers.length === 0) return []

  const timeoutMs = getConnectionTimeoutMs()
  const results: WrappedClient[] = []

  for (const server of mcpServers) {
    const normalized = createCandidates(server)
    if (!normalized) {
      results.push({ name: '<invalid>', type: 'failed' })
      continue
    }

    const { name, candidates } = normalized

    let lastError: unknown
    for (const candidate of candidates) {
      const client = new Client(
        { name: PRODUCT_COMMAND, version: MACRO.VERSION || '0.0.0' },
        { capabilities: {} },
      )

      try {
        await connectWithTimeout(client, candidate.transport, name, timeoutMs)

        if (candidate.kind === 'stdio') {
          candidate.transport.stderr?.on('data', (data: Buffer) => {
            const errorText = data.toString().trim()
            if (errorText) logMCPError(name, `Server stderr: ${errorText}`)
          })
        }

        let capabilities: ServerCapabilities | null = null
        try {
          capabilities = client.getServerCapabilities() ?? null
        } catch {
          capabilities = null
        }

        results.push({ name, client, capabilities, type: 'connected' as const })
        lastError = null
        break
      } catch (e) {
        lastError = e
        try {
          await client.close()
        } catch {}
      }
    }

    if (lastError) {
      logError(lastError)
      results.push({ name, type: 'failed' as const })
    }
  }

  return results
}

export function mergeMcpClients(
  base: WrappedClient[],
  extra: WrappedClient[],
): WrappedClient[] {
  const map = new Map<string, WrappedClient>()
  for (const c of base) map.set(c.name, c)
  for (const c of extra) map.set(c.name, c)
  return Array.from(map.values())
}
