import { zipObject } from 'lodash-es'
import {
  getCurrentProjectConfig,
  McpServerConfig,
  saveCurrentProjectConfig,
  getGlobalConfig,
  saveGlobalConfig,
  getMcprcConfig,
  getProjectMcpServerDefinitions,
  addMcprcServerForTesting,
  removeMcprcServerForTesting,
} from '@utils/config'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { getCwd } from '@utils/state'
import { safeParseJSON } from '@utils/json'
import { getSessionPlugins } from '@utils/sessionPlugins'
import {
  ImageBlockParam,
  MessageParam,
  ToolResultBlockParam,
} from '@anthropic-ai/sdk/resources/index.mjs'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { WebSocketClientTransport } from '@modelcontextprotocol/sdk/client/websocket.js'
import {
  CallToolResultSchema,
  ClientRequest,
  ListPromptsResult,
  ListPromptsResultSchema,
  ListToolsResult,
  ListToolsResultSchema,
  Result,
  ResultSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { memoize, pickBy } from 'lodash-es'
import type { Tool } from '@tool'
import { MCPTool } from '@tools/MCPTool/MCPTool'
import { logMCPError } from '@utils/log'
import { Command } from '@commands'
import { PRODUCT_COMMAND } from '@constants/product'

type McpName = string

function stripJsonComments(input: string): string {
  let out = ''
  let inString = false
  let escaped = false
  let inLineComment = false
  let inBlockComment = false

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!
    const next = i + 1 < input.length ? input[i + 1]! : ''

    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false
        out += ch
      }
      continue
    }

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false
        i++
      }
      continue
    }

    if (inString) {
      out += ch
      if (escaped) {
        escaped = false
        continue
      }
      if (ch === '\\') {
        escaped = true
        continue
      }
      if (ch === '"') inString = false
      continue
    }

    if (ch === '"') {
      inString = true
      out += ch
      continue
    }

    if (ch === '/' && next === '/') {
      inLineComment = true
      i++
      continue
    }

    if (ch === '/' && next === '*') {
      inBlockComment = true
      i++
      continue
    }

    out += ch
  }

  return out
}

function parseJsonOrJsonc(text: string): unknown {
  const raw = String(text ?? '')
  if (!raw.trim()) return null
  try {
    return JSON.parse(raw)
  } catch {
    try {
      return JSON.parse(stripJsonComments(raw))
    } catch {
      return null
    }
  }
}

function expandTemplateString(value: string, pluginRoot: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (match, key) => {
    const k = String(key ?? '').trim()
    if (!k) return match
    if (k === 'CLAUDE_PLUGIN_ROOT') return pluginRoot
    const env = process.env[k]
    return env !== undefined ? env : match
  })
}

function expandTemplateDeep(value: unknown, pluginRoot: string): unknown {
  if (typeof value === 'string') return expandTemplateString(value, pluginRoot)
  if (Array.isArray(value))
    return value.map(v => expandTemplateDeep(v, pluginRoot))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = expandTemplateDeep(v, pluginRoot)
    }
    return out
  }
  return value
}

export function listPluginMCPServers(): Record<string, McpServerConfig> {
  const plugins = getSessionPlugins()
  if (plugins.length === 0) return {}

  const out: Record<string, McpServerConfig> = {}

  for (const plugin of plugins) {
    const pluginRoot = plugin.rootDir
    const pluginName = plugin.name

    const configs: Array<Record<string, McpServerConfig>> = []

    // Files: .mcp.json/.mcp.jsonc + manifest-provided mcp server files
    for (const configPath of plugin.mcpConfigFiles ?? []) {
      try {
        const raw = readFileSync(configPath, 'utf8')
        const parsed = parseJsonOrJsonc(raw)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
          continue
        const rawServers =
          (parsed as any).mcpServers &&
          typeof (parsed as any).mcpServers === 'object' &&
          !Array.isArray((parsed as any).mcpServers)
            ? (parsed as any).mcpServers
            : parsed

        if (
          !rawServers ||
          typeof rawServers !== 'object' ||
          Array.isArray(rawServers)
        )
          continue

        const servers: Record<string, McpServerConfig> = {}
        for (const [name, cfg] of Object.entries(rawServers as any)) {
          if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) continue
          servers[name] = expandTemplateDeep(cfg, pluginRoot) as McpServerConfig
        }
        configs.push(servers)
      } catch {
        continue
      }
    }

    // Inline manifest config: plugin.json `mcpServers` object.
    const manifestRaw = (plugin.manifest as any)?.mcpServers
    if (
      manifestRaw &&
      typeof manifestRaw === 'object' &&
      !Array.isArray(manifestRaw)
    ) {
      const rawServers =
        (manifestRaw as any).mcpServers &&
        typeof (manifestRaw as any).mcpServers === 'object' &&
        !Array.isArray((manifestRaw as any).mcpServers)
          ? (manifestRaw as any).mcpServers
          : manifestRaw

      if (
        rawServers &&
        typeof rawServers === 'object' &&
        !Array.isArray(rawServers)
      ) {
        const servers: Record<string, McpServerConfig> = {}
        for (const [name, cfg] of Object.entries(rawServers as any)) {
          if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) continue
          servers[name] = expandTemplateDeep(cfg, pluginRoot) as McpServerConfig
        }
        configs.push(servers)
      }
    }

    const merged: Record<string, McpServerConfig> = Object.assign(
      {},
      ...configs,
    )

    for (const [serverName, cfg] of Object.entries(merged)) {
      const fullName = `plugin_${pluginName}_${serverName}`
      out[fullName] = cfg
    }
  }

  return out
}

function sanitizeMcpIdentifierPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function getMcpServerConnectionBatchSize(): number {
  const raw = process.env.MCP_SERVER_CONNECTION_BATCH_SIZE
  const parsed = raw ? Number.parseInt(raw, 10) : NaN
  if (Number.isFinite(parsed) && parsed > 0 && parsed <= 50) return parsed
  return 3
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

  const abort = () => {
    try {
      controller.abort()
    } catch {}
  }

  for (const s of active) {
    if (s.aborted) {
      abort()
      return { signal: controller.signal, cleanup: () => {} }
    }
    s.addEventListener('abort', abort, { once: true })
  }

  return { signal: controller.signal, cleanup: () => {} }
}

const IDE_MCP_TOOL_ALLOWLIST = new Set([
  'mcp__ide__executeCode',
  'mcp__ide__getDiagnostics',
])

export function parseEnvVars(
  rawEnvArgs: string[] | undefined,
): Record<string, string> {
  const parsedEnv: Record<string, string> = {}

  // Parse individual env vars
  if (rawEnvArgs) {
    for (const envStr of rawEnvArgs) {
      const [key, ...valueParts] = envStr.split('=')
      if (!key || valueParts.length === 0) {
        throw new Error(
          `Invalid environment variable format: ${envStr}, environment variables should be added as: -e KEY1=value1 -e KEY2=value2`,
        )
      }
      parsedEnv[key] = valueParts.join('=')
    }
  }
  return parsedEnv
}

const VALID_SCOPES = ['project', 'global', 'mcprc', 'mcpjson'] as const
type ConfigScope = (typeof VALID_SCOPES)[number]
const EXTERNAL_SCOPES = [
  'project',
  'global',
  'mcprc',
  'mcpjson',
] as ConfigScope[]

export function ensureConfigScope(scope?: string): ConfigScope {
  if (!scope) return 'project'

  const scopesToCheck =
    process.env.USER_TYPE === 'external' ? EXTERNAL_SCOPES : VALID_SCOPES

  if (!scopesToCheck.includes(scope as ConfigScope)) {
    throw new Error(
      `Invalid scope: ${scope}. Must be one of: ${scopesToCheck.join(', ')}`,
    )
  }

  return scope as ConfigScope
}

export function addMcpServer(
  name: McpName,
  server: McpServerConfig,
  scope: ConfigScope = 'project',
): void {
  if (scope === 'mcprc') {
    if (process.env.NODE_ENV === 'test') {
      addMcprcServerForTesting(name, server)
    } else {
      const mcprcPath = join(getCwd(), '.mcprc')
      let mcprcConfig: Record<string, McpServerConfig> = {}

      // Read existing config if present
      if (existsSync(mcprcPath)) {
        try {
          const mcprcContent = readFileSync(mcprcPath, 'utf-8')
          const existingConfig = safeParseJSON(mcprcContent)
          if (existingConfig && typeof existingConfig === 'object') {
            mcprcConfig = existingConfig as Record<string, McpServerConfig>
          }
        } catch {
          // If we can't read/parse, start with empty config
        }
      }

      // Add the server
      mcprcConfig[name] = server

      // Write back to .mcprc
      try {
        writeFileSync(mcprcPath, JSON.stringify(mcprcConfig, null, 2), 'utf-8')
      } catch (error) {
        throw new Error(`Failed to write to .mcprc: ${error}`)
      }
    }
  } else if (scope === 'mcpjson') {
    const mcpJsonPath = join(getCwd(), '.mcp.json')
    let config: Record<string, unknown> = { mcpServers: {} }

    if (existsSync(mcpJsonPath)) {
      try {
        const content = readFileSync(mcpJsonPath, 'utf-8')
        const parsed = safeParseJSON(content)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          config = parsed as Record<string, unknown>
        }
      } catch {
        // Fall back to empty config.
      }
    }

    const rawServers = (config as { mcpServers?: unknown }).mcpServers
    const servers =
      rawServers && typeof rawServers === 'object' && !Array.isArray(rawServers)
        ? (rawServers as Record<string, McpServerConfig>)
        : ({} as Record<string, McpServerConfig>)

    servers[name] = server
    config.mcpServers = servers

    try {
      writeFileSync(mcpJsonPath, JSON.stringify(config, null, 2), 'utf-8')
    } catch (error) {
      throw new Error(`Failed to write to .mcp.json: ${error}`)
    }
  } else if (scope === 'global') {
    const config = getGlobalConfig()
    if (!config.mcpServers) {
      config.mcpServers = {}
    }
    config.mcpServers[name] = server
    saveGlobalConfig(config)
  } else {
    const config = getCurrentProjectConfig()
    if (!config.mcpServers) {
      config.mcpServers = {}
    }
    config.mcpServers[name] = server
    saveCurrentProjectConfig(config)
  }
}

export function removeMcpServer(
  name: McpName,
  scope: ConfigScope = 'project',
): void {
  if (scope === 'mcprc') {
    if (process.env.NODE_ENV === 'test') {
      removeMcprcServerForTesting(name)
    } else {
      const mcprcPath = join(getCwd(), '.mcprc')
      if (!existsSync(mcprcPath)) {
        throw new Error('No .mcprc file found in this directory')
      }

      try {
        const mcprcContent = readFileSync(mcprcPath, 'utf-8')
        const mcprcConfig = safeParseJSON(mcprcContent) as Record<
          string,
          McpServerConfig
        > | null

        if (
          !mcprcConfig ||
          typeof mcprcConfig !== 'object' ||
          !mcprcConfig[name]
        ) {
          throw new Error(`No MCP server found with name: ${name} in .mcprc`)
        }

        delete mcprcConfig[name]
        writeFileSync(mcprcPath, JSON.stringify(mcprcConfig, null, 2), 'utf-8')
      } catch (error) {
        if (error instanceof Error) {
          throw error
        }
        throw new Error(`Failed to remove from .mcprc: ${error}`)
      }
    }
  } else if (scope === 'mcpjson') {
    const mcpJsonPath = join(getCwd(), '.mcp.json')
    if (!existsSync(mcpJsonPath)) {
      throw new Error('No .mcp.json file found in this directory')
    }

    try {
      const content = readFileSync(mcpJsonPath, 'utf-8')
      const parsed = safeParseJSON(content) as Record<string, unknown> | null
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Invalid .mcp.json format')
      }

      const rawServers = (parsed as { mcpServers?: unknown }).mcpServers
      if (
        !rawServers ||
        typeof rawServers !== 'object' ||
        Array.isArray(rawServers)
      ) {
        throw new Error('Invalid .mcp.json format (missing mcpServers)')
      }

      const servers = rawServers as Record<string, McpServerConfig>
      if (!servers[name]) {
        throw new Error(`No MCP server found with name: ${name} in .mcp.json`)
      }

      delete servers[name]
      ;(parsed as any).mcpServers = servers
      writeFileSync(mcpJsonPath, JSON.stringify(parsed, null, 2), 'utf-8')
    } catch (error) {
      if (error instanceof Error) throw error
      throw new Error(`Failed to remove from .mcp.json: ${error}`)
    }
  } else if (scope === 'global') {
    const config = getGlobalConfig()
    if (!config.mcpServers?.[name]) {
      throw new Error(`No global MCP server found with name: ${name}`)
    }
    delete config.mcpServers[name]
    saveGlobalConfig(config)
  } else {
    const config = getCurrentProjectConfig()
    if (!config.mcpServers?.[name]) {
      throw new Error(`No local MCP server found with name: ${name}`)
    }
    delete config.mcpServers[name]
    saveCurrentProjectConfig(config)
  }
}

export function listMCPServers(): Record<string, McpServerConfig> {
  const pluginServers = listPluginMCPServers()
  const globalConfig = getGlobalConfig()
  const projectFileConfig = getProjectMcpServerDefinitions().servers
  const projectConfig = getCurrentProjectConfig()
  return {
    ...(pluginServers ?? {}),
    ...(globalConfig.mcpServers ?? {}),
    ...(projectFileConfig ?? {}), // Project-file configs override global ones
    ...(projectConfig.mcpServers ?? {}), // Project configs override project-file ones
  }
}

export type ScopedMcpServerConfig = McpServerConfig & {
  scope: ConfigScope
}

export function getMcpServer(name: McpName): ScopedMcpServerConfig | undefined {
  const projectConfig = getCurrentProjectConfig()
  const projectFileDefinitions = getProjectMcpServerDefinitions()
  const projectFileConfig = projectFileDefinitions.servers
  const globalConfig = getGlobalConfig()

  // Check each scope in order of precedence
  if (projectConfig.mcpServers?.[name]) {
    return { ...projectConfig.mcpServers[name], scope: 'project' }
  }

  if (projectFileConfig?.[name]) {
    const source = projectFileDefinitions.sources[name]
    const scope: ConfigScope = source === '.mcp.json' ? 'mcpjson' : 'mcprc'
    return { ...projectFileConfig[name], scope }
  }

  if (globalConfig.mcpServers?.[name]) {
    return { ...globalConfig.mcpServers[name], scope: 'global' }
  }

  return undefined
}

async function connectToServer(
  name: string,
  serverRef: McpServerConfig,
): Promise<Client> {
  type Candidate = { transport: unknown; kind: 'stdio' | 'sse' | 'http' | 'ws' }

  const ensureWebSocketGlobal = async () => {
    if (typeof (globalThis as any).WebSocket === 'function') return
    try {
      const undici = await import('undici')
      if (typeof (undici as any).WebSocket === 'function') {
        ;(globalThis as any).WebSocket = (undici as any).WebSocket
      }
    } catch {
      // Ignore; transport creation will throw if WebSocket is unavailable.
    }
  }

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
          // Best-effort fallback: some servers call their transport "sse" but implement Streamable HTTP.
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
          // Best-effort fallback for legacy SSE servers.
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
            // Ignore; fall back to raw URL.
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
              env: {
                ...process.env,
                ...ref.env,
              } as Record<string, string>,
              stderr: 'pipe', // prevents error output from the MCP server from printing to the UI
            }),
          },
        ]
      }
    }
  })()

  // Avoid hanging indefinitely; make this configurable because some MCP servers may take longer
  // to finish their handshake.
  const rawTimeout = process.env.MCP_CONNECTION_TIMEOUT_MS
  const parsedTimeout = rawTimeout ? Number.parseInt(rawTimeout, 10) : NaN
  const CONNECTION_TIMEOUT_MS = Number.isFinite(parsedTimeout)
    ? parsedTimeout
    : 30_000

  let lastError: unknown

  for (const candidate of candidates) {
    const client = new Client(
      {
        name: PRODUCT_COMMAND,
        version: '0.1.0',
      },
      {
        capabilities: {},
      },
    )

    try {
      const connectPromise = client.connect(candidate.transport as any)
      if (CONNECTION_TIMEOUT_MS > 0) {
        const timeoutPromise = new Promise<never>((_, reject) => {
          const timeoutId = setTimeout(() => {
            reject(
              new Error(
                `Connection to MCP server "${name}" timed out after ${CONNECTION_TIMEOUT_MS}ms`,
              ),
            )
          }, CONNECTION_TIMEOUT_MS)

          connectPromise.then(
            () => clearTimeout(timeoutId),
            () => clearTimeout(timeoutId),
          )
        })

        await Promise.race([connectPromise, timeoutPromise])
      } else {
        await connectPromise
      }

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

      // Surface the fallback in logs to reduce confusion when configs are ambiguous.
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

type ConnectedClient = {
  client: Client
  capabilities?: Record<string, unknown> | null
  name: string
  type: 'connected'
}
type FailedClient = {
  name: string
  type: 'failed'
}
export type WrappedClient = ConnectedClient | FailedClient

export function getMcprcServerStatus(
  serverName: string,
): 'approved' | 'rejected' | 'pending' {
  const config = getCurrentProjectConfig()
  if (config.approvedMcprcServers?.includes(serverName)) {
    return 'approved'
  }
  if (config.rejectedMcprcServers?.includes(serverName)) {
    return 'rejected'
  }
  return 'pending'
}

export const getClients = memoize(async (): Promise<WrappedClient[]> => {
  // TODO: This is a temporary fix for a hang during npm run verify in CI.
  // We need to investigate why MCP client connections hang in CI verify but not in CI tests.
  if (process.env.CI && process.env.NODE_ENV !== 'test') {
    return []
  }

  const pluginServers = listPluginMCPServers()
  const globalServers = getGlobalConfig().mcpServers ?? {}
  const projectFileServers = getProjectMcpServerDefinitions().servers
  const projectServers = getCurrentProjectConfig().mcpServers ?? {}

  // Filter project-file servers (.mcp.json/.mcprc) to only include approved ones.
  const approvedProjectFileServers = pickBy(
    projectFileServers,
    (_, name) => getMcprcServerStatus(name) === 'approved',
  )

  const allServers = {
    ...pluginServers,
    ...globalServers,
    ...approvedProjectFileServers, // Approved project-file servers override global ones
    ...projectServers, // Project servers take highest precedence
  }

  const batchSize = getMcpServerConnectionBatchSize()
  const entries = Object.entries(allServers)
  const results: WrappedClient[] = []

  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize)
    const batchResults = await Promise.all(
      batch.map(async ([name, serverRef]) => {
        try {
          const client = await connectToServer(
            name,
            serverRef as McpServerConfig,
          )
          let capabilities: Record<string, unknown> | null = null
          try {
            capabilities = client.getServerCapabilities() as any
          } catch {
            capabilities = null
          }
          return { name, client, capabilities, type: 'connected' as const }
        } catch (error) {
          logMCPError(
            name,
            `Connection failed: ${error instanceof Error ? error.message : String(error)}`,
          )
          return { name, type: 'failed' as const }
        }
      }),
    )
    results.push(...batchResults)
  }

  return results
})

function parseMcpServersFromCliConfigEntries(options: {
  entries: string[]
  projectDir: string
}): Record<string, McpServerConfig> {
  const out: Record<string, McpServerConfig> = {}

  for (const rawEntry of options.entries) {
    const entry = String(rawEntry ?? '').trim()
    if (!entry) continue

    const resolvedPath = resolve(options.projectDir, entry)
    const payload = existsSync(resolvedPath)
      ? readFileSync(resolvedPath, 'utf8')
      : existsSync(entry)
        ? readFileSync(entry, 'utf8')
        : entry

    const parsed = parseJsonOrJsonc(payload)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue

    const rawServers =
      (parsed as any).mcpServers &&
      typeof (parsed as any).mcpServers === 'object' &&
      !Array.isArray((parsed as any).mcpServers)
        ? (parsed as any).mcpServers
        : parsed

    if (
      !rawServers ||
      typeof rawServers !== 'object' ||
      Array.isArray(rawServers)
    )
      continue

    for (const [name, cfg] of Object.entries(rawServers as any)) {
      if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) continue
      out[name] = cfg as McpServerConfig
    }
  }

  return out
}

export async function getClientsForCliMcpConfig(options: {
  mcpConfig?: string[]
  strictMcpConfig?: boolean
  projectDir?: string
}): Promise<WrappedClient[]> {
  const projectDir = options.projectDir ?? getCwd()
  const entries =
    Array.isArray(options.mcpConfig) && options.mcpConfig.length > 0
      ? options.mcpConfig
      : []
  const strict = options.strictMcpConfig === true

  if (entries.length === 0 && !strict) {
    return getClients()
  }

  const cliServers = parseMcpServersFromCliConfigEntries({
    entries,
    projectDir,
  })

  const pluginServers = strict ? {} : listPluginMCPServers()
  const globalServers = strict ? {} : (getGlobalConfig().mcpServers ?? {})
  const projectFileServers = strict
    ? {}
    : getProjectMcpServerDefinitions().servers
  const projectServers = strict
    ? {}
    : (getCurrentProjectConfig().mcpServers ?? {})

  const approvedProjectFileServers = strict
    ? {}
    : pickBy(
        projectFileServers,
        (_, name) => getMcprcServerStatus(name) === 'approved',
      )

  const allServers = {
    ...(pluginServers ?? {}),
    ...(globalServers ?? {}),
    ...(approvedProjectFileServers ?? {}),
    ...(projectServers ?? {}),
    ...(cliServers ?? {}),
  }

  const batchSize = getMcpServerConnectionBatchSize()
  const entriesToConnect = Object.entries(allServers)
  const results: WrappedClient[] = []

  for (let i = 0; i < entriesToConnect.length; i += batchSize) {
    const batch = entriesToConnect.slice(i, i + batchSize)
    const batchResults = await Promise.all(
      batch.map(async ([name, serverRef]) => {
        try {
          const client = await connectToServer(
            name,
            serverRef as McpServerConfig,
          )
          let capabilities: Record<string, unknown> | null = null
          try {
            capabilities = client.getServerCapabilities() as any
          } catch {
            capabilities = null
          }
          return { name, client, capabilities, type: 'connected' as const }
        } catch (error) {
          logMCPError(
            name,
            `Connection failed: ${error instanceof Error ? error.message : String(error)}`,
          )
          return { name, type: 'failed' as const }
        }
      }),
    )
    results.push(...batchResults)
  }

  return results
}

async function requestAll<
  ResultT extends Result,
  ResultSchemaT extends typeof ResultSchema,
>(
  req: ClientRequest,
  resultSchema: ResultSchemaT,
  requiredCapability: string,
): Promise<{ client: ConnectedClient; result: ResultT }[]> {
  const timeoutMs = getMcpToolTimeoutMs()
  const clients = await getClients()
  const results = await Promise.allSettled(
    clients.map(async client => {
      if (client.type === 'failed') return null

      let timeoutSignal: TimeoutSignal | null = null

      try {
        let capabilities: Record<string, unknown> | null =
          client.capabilities ?? null

        if (!capabilities) {
          try {
            capabilities = client.client.getServerCapabilities() as any
          } catch {
            capabilities = null
          }
          client.capabilities = capabilities
        }

        if (!(capabilities as any)?.[requiredCapability]) {
          return null
        }

        timeoutSignal = timeoutMs ? createTimeoutSignal(timeoutMs) : null
        const merged = mergeAbortSignals([timeoutSignal?.signal])

        return {
          client,
          result: (await client.client.request(
            req,
            resultSchema,
            merged?.signal ? ({ signal: merged.signal } as any) : undefined,
          )) as ResultT,
        }
      } catch (error) {
        if (client.type === 'connected') {
          logMCPError(
            client.name,
            `Failed to request '${req.method}': ${error instanceof Error ? error.message : String(error)}`,
          )
        }
        return null
      } finally {
        timeoutSignal?.cleanup()
      }
    }),
  )
  return results
    .filter(
      (
        result,
      ): result is PromiseFulfilledResult<{
        client: ConnectedClient
        result: ResultT
      } | null> => result.status === 'fulfilled',
    )
    .map(result => result.value)
    .filter(
      (result): result is { client: ConnectedClient; result: ResultT } =>
        result !== null,
    )
}

export const getMCPTools = memoize(async (): Promise<Tool[]> => {
  const toolsList = await requestAll<
    ListToolsResult,
    typeof ListToolsResultSchema
  >(
    {
      method: 'tools/list',
    },
    ListToolsResultSchema,
    'tools',
  )

  // TODO: Add zod schema validation
  return toolsList.flatMap(({ client, result: { tools } }) => {
    const serverPart = sanitizeMcpIdentifierPart(client.name)

    return tools
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
})

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

    // Handle toolResult-type response
    if ('toolResult' in result) {
      return String(result.toolResult)
    }

    // Handle structuredContent response
    if (
      'structuredContent' in result &&
      result.structuredContent !== undefined
    ) {
      return JSON.stringify(result.structuredContent)
    }

    // Handle content array response
    if ('content' in result && Array.isArray(result.content)) {
      return result.content.map(item => {
        if (item.type === 'image') {
          return {
            type: 'image',
            source: {
              type: 'base64',
              data: String(item.data),
              media_type: item.mimeType as ImageBlockParam.Source['media_type'],
            },
          }
        }
        return item
      })
    }

    throw Error(`Unexpected response format from tool ${tool}`)
  } finally {
    timeoutSignal?.cleanup()
  }
}

export const getMCPCommands = memoize(async (): Promise<Command[]> => {
  const results = await requestAll<
    ListPromptsResult,
    typeof ListPromptsResultSchema
  >(
    {
      method: 'prompts/list',
    },
    ListPromptsResultSchema,
    'prompts',
  )

  return results.flatMap(({ client, result }) =>
    result.prompts?.map(_ => {
      const serverPart = sanitizeMcpIdentifierPart(client.name)
      const argNames = Object.values(_.arguments ?? {}).map(k => k.name)
      return {
        type: 'prompt',
        name: `mcp__${serverPart}__${_.name}`,
        description: _.description ?? '',
        isEnabled: true,
        isHidden: false,
        progressMessage: 'running',
        userFacingName() {
          const title =
            typeof (_ as any).title === 'string' ? (_ as any).title : _.name
          return `${client.name}:${title} (MCP)`
        },
        argNames,
        async getPromptForCommand(args: string) {
          const argsArray = args.split(' ')
          return await runCommand(
            { name: _.name, client },
            zipObject(argNames, argsArray),
          )
        },
      }
    }),
  )
})

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
                media_type: (content as any)
                  .mimeType as ImageBlockParam.Source['media_type'],
                type: 'base64',
              },
            },
          ],
        }
      }
      // Fallback: render unknown content as text description
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
