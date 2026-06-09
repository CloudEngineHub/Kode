import { zipObject } from 'lodash-es'
import type { Tool } from '@tool'
import { MCPTool } from '@tools/mcp/MCPTool/MCPTool'
import { logMCPError } from '@utils/log'
import { debug } from '@utils/log/debugLogger'
import type { Command } from '@commands'
import type { MessageParam, ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import {
  CallToolResultSchema,
  PromptListChangedNotificationSchema,
  ToolListChangedNotificationSchema,
  type ClientRequest,
  type ListPromptsResult,
  ListPromptsResultSchema,
  type ListToolsResult,
  ListToolsResultSchema,
  type Result,
  ResultSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { normalizeImageMediaType } from '@utils/ai/anthropic'
import { getClients, type WrappedClient } from './client'

type ConnectedClient = Extract<WrappedClient, { type: 'connected' }>

type CachedDiscovery<ResultT extends Result> = {
  client: ConnectedClient
  promise: Promise<ResultT | null>
}

const toolDiscoveryCache = new Map<string, CachedDiscovery<ListToolsResult>>()
const promptDiscoveryCache = new Map<
  string,
  CachedDiscovery<ListPromptsResult>
>()
const toolNotificationClients = new WeakSet<object>()
const promptNotificationClients = new WeakSet<object>()

function sanitizeMcpIdentifierPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function getMcpToolTimeoutMs(): number | null {
  const raw = process.env.MCP_TOOL_TIMEOUT
  const parsed = raw ? Number.parseInt(raw, 10) : NaN
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return parsed
}

type TimeoutSignal = { signal: AbortSignal; cleanup: () => void }

function createTimeoutSignal(timeoutMs: number): TimeoutSignal {
  const timeoutFn = (AbortSignal as any)?.timeout
  if (typeof timeoutFn === 'function') {
    return { signal: timeoutFn(timeoutMs) as AbortSignal, cleanup: () => {} }
  }

  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  return { signal: controller.signal, cleanup: () => clearTimeout(id) }
}

function mergeAbortSignals(
  signals: Array<AbortSignal | undefined>,
): { signal: AbortSignal; cleanup: () => void } | null {
  const active = signals.filter((s): s is AbortSignal => !!s)
  if (active.length === 0) return null
  if (active.length === 1) return { signal: active[0]!, cleanup: () => {} }

  const controller = new AbortController()
  const listeners: Array<{ signal: AbortSignal; abort: () => void }> = []

  const abort = () => {
    try {
      controller.abort()
    } catch {}
  }

  for (const signal of active) {
    if (signal.aborted) {
      abort()
      for (const listener of listeners) {
        listener.signal.removeEventListener('abort', listener.abort)
      }
      return { signal: controller.signal, cleanup: () => {} }
    }
    signal.addEventListener('abort', abort, { once: true })
    listeners.push({ signal, abort })
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      for (const listener of listeners) {
        listener.signal.removeEventListener('abort', listener.abort)
      }
    },
  }
}

const IDE_MCP_TOOL_ALLOWLIST = new Set([
  'mcp__ide__executeCode',
  'mcp__ide__getDiagnostics',
])

function getServerCapabilities(
  client: ConnectedClient,
): Record<string, unknown> | null {
  let capabilities: Record<string, unknown> | null = client.capabilities ?? null
  if (capabilities) return capabilities

  try {
    capabilities = client.client.getServerCapabilities() as any
  } catch {
    capabilities = null
  }
  client.capabilities = capabilities
  return capabilities
}

function hasCapability(
  client: ConnectedClient,
  requiredCapability: string,
): boolean {
  const capabilities = getServerCapabilities(client)
  return Boolean((capabilities as any)?.[requiredCapability])
}

function supportsListChanged(
  client: ConnectedClient,
  capability: 'tools' | 'prompts',
): boolean {
  const capabilities = getServerCapabilities(client)
  return Boolean((capabilities as any)?.[capability]?.listChanged)
}

function registerToolListChangedHandler(client: ConnectedClient): void {
  if (!supportsListChanged(client, 'tools')) return
  if (toolNotificationClients.has(client.client)) return

  client.client.setNotificationHandler(
    ToolListChangedNotificationSchema,
    async () => {
      toolDiscoveryCache.delete(client.name)
      debug.info('MCP_TOOLS_CACHE_INVALIDATED', { server: client.name })
    },
  )
  toolNotificationClients.add(client.client)
}

function registerPromptListChangedHandler(client: ConnectedClient): void {
  if (!supportsListChanged(client, 'prompts')) return
  if (promptNotificationClients.has(client.client)) return

  client.client.setNotificationHandler(
    PromptListChangedNotificationSchema,
    async () => {
      promptDiscoveryCache.delete(client.name)
      debug.info('MCP_PROMPTS_CACHE_INVALIDATED', { server: client.name })
    },
  )
  promptNotificationClients.add(client.client)
}

async function requestFromClient<
  ResultT extends Result,
  ResultSchemaT extends typeof ResultSchema,
>(
  client: ConnectedClient,
  req: ClientRequest,
  resultSchema: ResultSchemaT,
): Promise<ResultT | null> {
  const timeoutMs = getMcpToolTimeoutMs()
  let timeoutSignal: TimeoutSignal | null = null
  let merged: { signal: AbortSignal; cleanup: () => void } | null = null
  const startedAt = Date.now()

  debug.info('MCP_DISCOVERY_REFRESH_START', {
    server: client.name,
    method: req.method,
  })

  try {
    timeoutSignal = timeoutMs ? createTimeoutSignal(timeoutMs) : null
    merged = mergeAbortSignals([timeoutSignal?.signal])

    const result = (await client.client.request(
      req,
      resultSchema,
      merged?.signal ? ({ signal: merged.signal } as any) : undefined,
    )) as ResultT

    debug.info('MCP_DISCOVERY_REFRESH_DONE', {
      server: client.name,
      method: req.method,
      durationMs: Date.now() - startedAt,
    })

    return result
  } catch (error) {
    logMCPError(
      client.name,
      `Failed to request '${req.method}': ${error instanceof Error ? error.message : String(error)}`,
    )
    return null
  } finally {
    merged?.cleanup()
    timeoutSignal?.cleanup()
  }
}

async function getCachedServerDiscovery<
  ResultT extends Result,
  ResultSchemaT extends typeof ResultSchema,
>(options: {
  client: ConnectedClient
  cache: Map<string, CachedDiscovery<ResultT>>
  req: ClientRequest
  resultSchema: ResultSchemaT
  requiredCapability: 'tools' | 'prompts'
}): Promise<ResultT | null> {
  const { client, cache, req, resultSchema, requiredCapability } = options

  if (!hasCapability(client, requiredCapability)) return null
  if (requiredCapability === 'tools') registerToolListChangedHandler(client)
  else registerPromptListChangedHandler(client)

  const cached = cache.get(client.name)
  if (cached && cached.client.client === client.client) return cached.promise

  const promise = requestFromClient<ResultT, ResultSchemaT>(
    client,
    req,
    resultSchema,
  ).then(result => {
    if (result === null) cache.delete(client.name)
    return result
  })
  cache.set(client.name, { client, promise })
  return promise
}

async function getConnectedClients(): Promise<ConnectedClient[]> {
  const clients = await getClients()
  return clients.filter(
    (client): client is ConnectedClient => client.type === 'connected',
  )
}

type CacheClearableFn<T> = (() => Promise<T>) & { cache: { clear: () => void } }

export const getMCPTools: CacheClearableFn<Tool[]> = Object.assign(
  async (): Promise<Tool[]> => {
    const clients = await getConnectedClients()
    const toolsList = await Promise.all(
      clients.map(async client => ({
        client,
        result: await getCachedServerDiscovery({
          client,
          cache: toolDiscoveryCache,
          req: { method: 'tools/list' },
          resultSchema: ListToolsResultSchema,
          requiredCapability: 'tools',
        }),
      })),
    )

    return toolsList.flatMap(({ client, result }) => {
      if (!result) return []
      const serverPart = sanitizeMcpIdentifierPart(client.name)

      return result.tools
        .map((tool): Tool | null => {
          const toolPart = sanitizeMcpIdentifierPart(tool.name)
          const name = `mcp__${serverPart}__${toolPart}`

          if (
            name.startsWith('mcp__ide__') &&
            !IDE_MCP_TOOL_ALLOWLIST.has(name)
          ) {
            return null
          }

          return {
            ...MCPTool,
            name,
            isConcurrencySafe() {
              return tool.annotations?.readOnlyHint ?? false
            },
            isReadOnly() {
              return tool.annotations?.readOnlyHint ?? false
            },
            async description() {
              return tool.description ?? ''
            },
            async prompt() {
              return tool.description ?? ''
            },
            inputJSONSchema: tool.inputSchema as Tool['inputJSONSchema'],
            async validateInput() {
              return { result: true }
            },
            async *call(args: Record<string, unknown>, context) {
              const data = await callMCPTool({
                client,
                tool: tool.name,
                args,
                toolUseId: context.toolUseId,
                signal: context.abortController.signal,
              })
              yield {
                type: 'result' as const,
                data,
                resultForAssistant: data,
              }
            },
            userFacingName() {
              const title = tool.annotations?.title || tool.name
              return `${client.name} - ${title} (MCP)`
            },
          }
        })
        .filter((tool): tool is Tool => tool !== null)
    })
  },
  {
    cache: {
      clear: () => {
        toolDiscoveryCache.clear()
      },
    },
  },
)

async function callMCPTool({
  client: { client, name },
  tool,
  args,
  toolUseId,
  signal,
}: {
  client: ConnectedClient
  tool: string
  args: Record<string, unknown>
  toolUseId?: string
  signal?: AbortSignal
}): Promise<ToolResultBlockParam['content']> {
  const timeoutMs = getMcpToolTimeoutMs()
  const timeoutSignal = timeoutMs ? createTimeoutSignal(timeoutMs) : null
  const merged = mergeAbortSignals([signal, timeoutSignal?.signal])

  const meta =
    toolUseId && toolUseId.trim()
      ? { 'claudecode/toolUseId': toolUseId }
      : undefined

  try {
    const result = await client.callTool(
      {
        name: tool,
        arguments: args,
        ...(meta ? { _meta: meta } : {}),
      },
      CallToolResultSchema,
      merged?.signal ? ({ signal: merged.signal } as any) : undefined,
    )

    if ('isError' in result && result.isError) {
      const contentText =
        'content' in result && Array.isArray(result.content)
          ? result.content.find(item => item.type === 'text' && 'text' in item)
          : null

      const rawMessage =
        contentText && typeof (contentText as any).text === 'string'
          ? String((contentText as any).text)
          : 'error' in result && result.error
            ? String(result.error)
            : ''

      const message = rawMessage || `Error calling tool ${tool}`
      logMCPError(name, `Error calling tool ${tool}: ${message}`)
      throw new Error(message)
    }

    if ('toolResult' in result) {
      return String(result.toolResult)
    }

    if (
      'structuredContent' in result &&
      result.structuredContent !== undefined
    ) {
      return JSON.stringify(result.structuredContent)
    }

    if ('content' in result && Array.isArray(result.content)) {
      return result.content.map(item => {
        if (item.type === 'image') {
          return {
            type: 'image',
            source: {
              type: 'base64',
              data: String(item.data),
              media_type: normalizeImageMediaType(item.mimeType),
            },
          }
        }
        return item
      }) as ToolResultBlockParam['content']
    }

    throw Error(`Unexpected response format from tool ${tool}`)
  } finally {
    merged?.cleanup()
    timeoutSignal?.cleanup()
  }
}

export const getMCPCommands: CacheClearableFn<Command[]> = Object.assign(
  async (): Promise<Command[]> => {
    const clients = await getConnectedClients()
    const results = await Promise.all(
      clients.map(async client => ({
        client,
        result: await getCachedServerDiscovery({
          client,
          cache: promptDiscoveryCache,
          req: { method: 'prompts/list' },
          resultSchema: ListPromptsResultSchema,
          requiredCapability: 'prompts',
        }),
      })),
    )

    return results.flatMap(({ client, result }) => {
      if (!result) return []

      return result.prompts?.map(prompt => {
        const serverPart = sanitizeMcpIdentifierPart(client.name)
        const argNames = Object.values(prompt.arguments ?? {}).map(k => k.name)
        return {
          type: 'prompt',
          name: `mcp__${serverPart}__${prompt.name}`,
          description: prompt.description ?? '',
          isEnabled: true,
          isHidden: false,
          progressMessage: 'running',
          userFacingName() {
            const title =
              typeof (prompt as any).title === 'string'
                ? (prompt as any).title
                : prompt.name
            return `${client.name}:${title} (MCP)`
          },
          argNames,
          async getPromptForCommand(args: string) {
            const argsArray = args.split(' ')
            return await runCommand(
              { name: prompt.name, client },
              zipObject(argNames, argsArray),
            )
          },
        } satisfies Command
      })
    })
  },
  {
    cache: {
      clear: () => {
        promptDiscoveryCache.clear()
      },
    },
  },
)

export async function runCommand(
  { name, client }: { name: string; client: ConnectedClient },
  args: Record<string, string>,
): Promise<MessageParam[]> {
  try {
    const result = await client.client.getPrompt({ name, arguments: args })
    return result.messages.map((message): MessageParam => {
      const content = message.content
      if (content.type === 'text') {
        return {
          role: message.role,
          content: [
            {
              type: 'text',
              text: content.text,
            },
          ],
        }
      }
      if (content.type === 'image' && 'data' in content) {
        return {
          role: message.role,
          content: [
            {
              type: 'image',
              source: {
                data: String((content as any).data),
                media_type: normalizeImageMediaType((content as any).mimeType),
                type: 'base64',
              },
            },
          ],
        }
      }
      return {
        role: message.role,
        content: [
          {
            type: 'text',
            text: `Unsupported MCP content type ${(content as any)?.type ?? 'unknown'}`,
          },
        ],
      }
    })
  } catch (error) {
    logMCPError(
      client.name,
      `Error running command '${name}': ${error instanceof Error ? error.message : String(error)}`,
    )
    throw error
  }
}
