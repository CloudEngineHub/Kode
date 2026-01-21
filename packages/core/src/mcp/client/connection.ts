import type { Buffer } from 'node:buffer'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { WebSocketClientTransport } from '@modelcontextprotocol/sdk/client/websocket.js'

import type { McpServerConfig } from '#core/utils/config'
import { PRODUCT_COMMAND } from '#core/constants/product'
import { logMCPError } from '#core/utils/log'

import { notifyMcpListChanged } from './listChanged'

type GlobalWithWebSocket = { WebSocket?: unknown }

async function ensureWebSocketGlobal(): Promise<void> {
  const global = globalThis as unknown as GlobalWithWebSocket
  if (typeof global.WebSocket === 'function') return

  try {
    const undiciModule = await import('undici')
    const maybeWs = (undiciModule as unknown as GlobalWithWebSocket).WebSocket
    if (typeof maybeWs === 'function') {
      global.WebSocket = maybeWs
    }
  } catch {
    // ignore
  }
}

function buildStdioEnv(extra?: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') env[key] = value
  }
  if (extra) Object.assign(env, extra)
  return env
}

type Candidate =
  | { kind: 'stdio'; transport: StdioClientTransport }
  | { kind: 'sse'; transport: SSEClientTransport }
  | { kind: 'http'; transport: StreamableHTTPClientTransport }
  | { kind: 'ws'; transport: WebSocketClientTransport }

export async function connectToServer(
  name: string,
  serverRef: McpServerConfig,
): Promise<Client> {
  const candidates: Candidate[] = await (async () => {
    switch (serverRef.type) {
      case 'sse': {
        const ref = serverRef
        return [
          {
            kind: 'sse',
            transport: new SSEClientTransport(new URL(ref.url), {
              ...(ref.headers ? { requestInit: { headers: ref.headers } } : {}),
            }),
          },
          {
            kind: 'http',
            transport: new StreamableHTTPClientTransport(new URL(ref.url), {
              ...(ref.headers ? { requestInit: { headers: ref.headers } } : {}),
            }),
          },
        ]
      }
      case 'sse-ide': {
        const ref = serverRef
        return [
          {
            kind: 'sse',
            transport: new SSEClientTransport(new URL(ref.url), {
              ...(ref.headers ? { requestInit: { headers: ref.headers } } : {}),
            }),
          },
        ]
      }
      case 'http': {
        const ref = serverRef
        return [
          {
            kind: 'http',
            transport: new StreamableHTTPClientTransport(new URL(ref.url), {
              ...(ref.headers ? { requestInit: { headers: ref.headers } } : {}),
            }),
          },
          {
            kind: 'sse',
            transport: new SSEClientTransport(new URL(ref.url), {
              ...(ref.headers ? { requestInit: { headers: ref.headers } } : {}),
            }),
          },
        ]
      }
      case 'ws': {
        const ref = serverRef
        await ensureWebSocketGlobal()
        return [
          {
            kind: 'ws',
            transport: new WebSocketClientTransport(new URL(ref.url)),
          },
        ]
      }
      case 'ws-ide': {
        const ref = serverRef

        let url = ref.url
        if (ref.authToken) {
          try {
            const parsed = new URL(url)
            if (!parsed.searchParams.has('authToken')) {
              parsed.searchParams.set('authToken', ref.authToken)
              url = parsed.toString()
            }
          } catch {
            // ignore
          }
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
      default: {
        const ref = serverRef
        return [
          {
            kind: 'stdio',
            transport: new StdioClientTransport({
              command: ref.command,
              args: ref.args,
              env: buildStdioEnv(ref.env),
              stderr: 'pipe',
            }),
          },
        ]
      }
    }
  })()

  const rawTimeout = process.env.MCP_CONNECTION_TIMEOUT_MS
  const parsedTimeout = rawTimeout ? Number.parseInt(rawTimeout, 10) : NaN
  const connectionTimeoutMs = Number.isFinite(parsedTimeout)
    ? parsedTimeout
    : 30_000

  let lastError: unknown

  for (const candidate of candidates) {
    const client = new Client(
      { name: PRODUCT_COMMAND, version: '0.1.0' },
      {
        capabilities: {},
        listChanged: {
          tools: {
            onChanged: (error: Error | null) => {
              if (error) {
                logMCPError(
                  name,
                  `Failed to refresh tools after list change: ${error.message}`,
                )
                return
              }
              notifyMcpListChanged({ kind: 'tools', server: name })
            },
          },
          prompts: {
            onChanged: (error: Error | null) => {
              if (error) {
                logMCPError(
                  name,
                  `Failed to refresh prompts after list change: ${error.message}`,
                )
                return
              }
              notifyMcpListChanged({ kind: 'prompts', server: name })
            },
          },
          resources: {
            onChanged: (error: Error | null) => {
              if (error) {
                logMCPError(
                  name,
                  `Failed to refresh resources after list change: ${error.message}`,
                )
                return
              }
              notifyMcpListChanged({ kind: 'resources', server: name })
            },
          },
        },
      },
    )

    try {
      const connectPromise = client.connect(candidate.transport)
      let timeoutId: ReturnType<typeof setTimeout> | null = null

      try {
        if (connectionTimeoutMs > 0) {
          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
              reject(
                new Error(
                  `Connection to MCP server "${name}" timed out after ${connectionTimeoutMs}ms`,
                ),
              )
            }, connectionTimeoutMs)
          })

          await Promise.race([connectPromise, timeoutPromise])
        } else {
          await connectPromise
        }
      } finally {
        if (timeoutId) clearTimeout(timeoutId)
      }

      if (candidate.kind === 'stdio') {
        candidate.transport.stderr?.on('data', (data: Buffer) => {
          const errorText = data.toString().trim()
          if (errorText) logMCPError(name, `Server stderr: ${errorText}`)
        })
      }

      if (candidates.length > 1 && candidate !== candidates[0]) {
        logMCPError(
          name,
          `Connected using fallback transport "${candidate.kind}". Consider setting the server type explicitly in your MCP config.`,
        )
      }

      return client
    } catch (error) {
      lastError = error
      try {
        await client.close()
      } catch {}
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Failed to connect to MCP server "${name}"`)
}
