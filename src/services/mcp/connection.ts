import type { McpServerConfig } from '@utils/config'
import { PRODUCT_COMMAND } from '@constants/product'
import { logMCPError } from '@utils/log'
import { debug } from '@utils/log/debugLogger'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { WebSocketClientTransport } from '@modelcontextprotocol/sdk/client/websocket.js'

export type ConnectedClient = {
  client: Client
  capabilities?: Record<string, unknown> | null
  name: string
  type: 'connected'
}

export type FailedClient = {
  name: string
  type: 'failed'
}

export type WrappedClient = ConnectedClient | FailedClient

type TransportKind = 'stdio' | 'sse' | 'http' | 'ws'

type TransportCandidate = {
  kind: TransportKind
  transport: unknown
}

export function getMcpServerConnectionBatchSize(): number {
  const raw = process.env.MCP_SERVER_CONNECTION_BATCH_SIZE
  const parsed = raw ? Number.parseInt(raw, 10) : NaN
  if (Number.isFinite(parsed) && parsed > 0 && parsed <= 50) return parsed
  return 3
}

export function getMcpConnectionTimeoutMs(): number {
  const rawTimeout = process.env.MCP_CONNECTION_TIMEOUT_MS
  const parsedTimeout = rawTimeout ? Number.parseInt(rawTimeout, 10) : NaN
  return Number.isFinite(parsedTimeout) ? parsedTimeout : 30_000
}

async function ensureWebSocketGlobal(): Promise<void> {
  if (typeof (globalThis as any).WebSocket === 'function') return
  try {
    const undici = await import('undici')
    if (typeof (undici as any).WebSocket === 'function') {
      ;(globalThis as any).WebSocket = (undici as any).WebSocket
    }
  } catch {}
}

export async function createMcpTransportCandidates(
  serverRef: McpServerConfig,
): Promise<TransportCandidate[]> {
  switch (serverRef.type) {
    case 'sse':
      return [
        {
          kind: 'sse',
          transport: new SSEClientTransport(new URL(serverRef.url), {
            ...(serverRef.headers
              ? { requestInit: { headers: serverRef.headers } }
              : {}),
          }),
        },
        {
          kind: 'http',
          transport: new StreamableHTTPClientTransport(new URL(serverRef.url), {
            ...(serverRef.headers
              ? { requestInit: { headers: serverRef.headers } }
              : {}),
          }),
        },
      ]
    case 'sse-ide':
      return [
        {
          kind: 'sse',
          transport: new SSEClientTransport(new URL(serverRef.url), {
            ...(serverRef.headers
              ? { requestInit: { headers: serverRef.headers } }
              : {}),
          }),
        },
      ]
    case 'http':
      return [
        {
          kind: 'http',
          transport: new StreamableHTTPClientTransport(new URL(serverRef.url), {
            ...(serverRef.headers
              ? { requestInit: { headers: serverRef.headers } }
              : {}),
          }),
        },
        {
          kind: 'sse',
          transport: new SSEClientTransport(new URL(serverRef.url), {
            ...(serverRef.headers
              ? { requestInit: { headers: serverRef.headers } }
              : {}),
          }),
        },
      ]
    case 'ws':
      await ensureWebSocketGlobal()
      return [
        {
          kind: 'ws',
          transport: new WebSocketClientTransport(new URL(serverRef.url)),
        },
      ]
    case 'ws-ide': {
      let url = serverRef.url
      if (serverRef.authToken) {
        try {
          const parsed = new URL(url)
          if (!parsed.searchParams.has('authToken')) {
            parsed.searchParams.set('authToken', serverRef.authToken)
            url = parsed.toString()
          }
        } catch {}
      }

      await ensureWebSocketGlobal()
      return [
        {
          kind: 'ws',
          transport: new WebSocketClientTransport(new URL(url)),
        },
      ]
    }
    case 'stdio':
    default:
      return [
        {
          kind: 'stdio',
          transport: new StdioClientTransport({
            command: serverRef.command,
            args: serverRef.args,
            env: {
              ...process.env,
              ...serverRef.env,
            } as Record<string, string>,
            stderr: 'pipe',
          }),
        },
      ]
  }
}

async function connectWithTimeout(
  client: Client,
  transport: unknown,
  serverName: string,
  timeoutMs: number,
): Promise<void> {
  const connectPromise = client.connect(transport as any)
  if (timeoutMs <= 0) {
    await connectPromise
    return
  }

  const timeoutPromise = new Promise<never>((_, reject) => {
    const timeoutId = setTimeout(() => {
      reject(
        new Error(
          `Connection to MCP server "${serverName}" timed out after ${timeoutMs}ms`,
        ),
      )
    }, timeoutMs)

    connectPromise.then(
      () => clearTimeout(timeoutId),
      () => clearTimeout(timeoutId),
    )
  })

  await Promise.race([connectPromise, timeoutPromise])
}

export function captureMcpCapabilities(
  client: Client,
): Record<string, unknown> | null {
  try {
    return client.getServerCapabilities() as any
  } catch {
    return null
  }
}

export async function connectMcpClient(
  name: string,
  serverRef: McpServerConfig,
  options?: { clientVersion?: string },
): Promise<Client> {
  const candidates = await createMcpTransportCandidates(serverRef)
  const timeoutMs = getMcpConnectionTimeoutMs()
  const startedAt = Date.now()
  let lastError: unknown

  debug.info('MCP_CONNECT_START', {
    server: name,
    type: serverRef.type ?? 'stdio',
    candidates: candidates.map(candidate => candidate.kind),
    timeoutMs,
  })

  for (const candidate of candidates) {
    const client = new Client(
      {
        name: PRODUCT_COMMAND,
        version: options?.clientVersion ?? '0.1.0',
      },
      {
        capabilities: {},
      },
    )

    try {
      if (candidate.kind === 'stdio') {
        ;(candidate.transport as StdioClientTransport).stderr?.on(
          'data',
          (data: Buffer) => {
            const errorText = data.toString().trim()
            if (errorText) {
              logMCPError(name, `Server stderr: ${errorText}`)
            }
          },
        )
      }

      await connectWithTimeout(client, candidate.transport, name, timeoutMs)

      if (candidates.length > 1 && candidate !== candidates[0]) {
        logMCPError(
          name,
          `Connected using fallback transport "${candidate.kind}". Consider setting the server type explicitly in your MCP config.`,
        )
      }

      debug.info('MCP_CONNECT_SUCCESS', {
        server: name,
        transport: candidate.kind,
        durationMs: Date.now() - startedAt,
      })

      return client
    } catch (error) {
      lastError = error
      try {
        await client.close()
      } catch {}
    }
  }

  debug.warn('MCP_CONNECT_FAILED', {
    server: name,
    durationMs: Date.now() - startedAt,
    error: lastError instanceof Error ? lastError.message : String(lastError),
  })

  throw lastError instanceof Error
    ? lastError
    : new Error(`Failed to connect to MCP server "${name}"`)
}

export async function connectMcpServer(
  name: string,
  serverRef: McpServerConfig,
  options?: { clientVersion?: string },
): Promise<WrappedClient> {
  try {
    const client = await connectMcpClient(name, serverRef, options)
    return {
      name,
      client,
      capabilities: captureMcpCapabilities(client),
      type: 'connected',
    }
  } catch (error) {
    logMCPError(
      name,
      `Connection failed: ${error instanceof Error ? error.message : String(error)}`,
    )
    return { name, type: 'failed' }
  }
}

export async function connectMcpServers(
  servers: Record<string, McpServerConfig>,
  options?: { clientVersion?: string },
): Promise<WrappedClient[]> {
  const batchSize = getMcpServerConnectionBatchSize()
  const entries = Object.entries(servers)
  const results: WrappedClient[] = []

  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize)
    const startedAt = Date.now()
    debug.info('MCP_CONNECT_BATCH_START', {
      offset: i,
      size: batch.length,
      total: entries.length,
    })
    const batchResults = await Promise.all(
      batch.map(([name, serverRef]) =>
        connectMcpServer(name, serverRef, options),
      ),
    )
    debug.info('MCP_CONNECT_BATCH_DONE', {
      offset: i,
      size: batch.length,
      durationMs: Date.now() - startedAt,
      connected: batchResults.filter(result => result.type === 'connected')
        .length,
      failed: batchResults.filter(result => result.type === 'failed').length,
    })
    results.push(...batchResults)
  }

  return results
}
