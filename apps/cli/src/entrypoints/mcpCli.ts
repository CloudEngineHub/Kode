import { Command } from 'commander'
import chalk from 'chalk'
import { setCwd } from '#core/utils/state'
import { getClients, type WrappedClient } from '#core/mcp/client'
import {
  CallToolResultSchema,
  ListResourcesResultSchema,
  ListToolsResultSchema,
  ReadResourceResultSchema,
} from '@modelcontextprotocol/sdk/types.js'

type McpCliToolSummary = {
  server: string
  name: string
  description?: string
  inputSchema?: unknown
}

type McpCliResourceSummary = {
  server: string
  uri: string
  name: string
  description?: string
  mimeType?: string
}

function toJson(value: unknown): string {
  return JSON.stringify(value)
}

function toPrettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function parseServerTool(input: string): { server: string; tool: string } {
  const trimmed = input.trim()
  const slash = trimmed.indexOf('/')
  if (slash <= 0 || slash === trimmed.length - 1) {
    throw new Error(
      `Invalid tool identifier "${input}". Expected format "<server>/<tool>".`,
    )
  }
  return { server: trimmed.slice(0, slash), tool: trimmed.slice(slash + 1) }
}

function parseServerResource(input: string): { server: string; uri: string } {
  const trimmed = input.trim()
  const slash = trimmed.indexOf('/')
  if (slash <= 0 || slash === trimmed.length - 1) {
    throw new Error(
      `Invalid resource identifier "${input}". Expected format "<server>/<uri>".`,
    )
  }
  return { server: trimmed.slice(0, slash), uri: trimmed.slice(slash + 1) }
}

async function readStdinUtf8(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
  }
  return Buffer.concat(chunks).toString('utf8').trim()
}

function getConnectedClient(
  clients: WrappedClient[],
  server: string,
): Extract<WrappedClient, { type: 'connected' }> {
  const match = clients.find(c => c.name === server)
  if (!match) {
    throw new Error(
      `Server '${server}' not found. Available servers: ${clients.map(c => c.name).join(', ')}`,
    )
  }
  if (match.type !== 'connected') {
    throw new Error(`Server '${server}' is not connected`)
  }
  return match
}

async function listTools(options: {
  server?: string
}): Promise<McpCliToolSummary[]> {
  const clients = await getClients()
  const selected = options.server
    ? clients.filter(c => c.name === options.server)
    : clients
  if (options.server && selected.length === 0) {
    throw new Error(
      `Server '${options.server}' not found. Available servers: ${clients.map(c => c.name).join(', ')}`,
    )
  }

  const out: McpCliToolSummary[] = []
  for (const wrapped of selected) {
    if (wrapped.type !== 'connected') continue
    let capabilities = wrapped.capabilities ?? null
    if (!capabilities) {
      try {
        capabilities = wrapped.client.getServerCapabilities() ?? null
      } catch {
        capabilities = null
      }
      wrapped.capabilities = capabilities
    }
    if (!capabilities?.tools) continue
    const result = await wrapped.client.request(
      { method: 'tools/list' },
      ListToolsResultSchema,
    )
    for (const tool of result.tools ?? []) {
      out.push({
        server: wrapped.name,
        name: tool.name,
        description: tool.description ?? undefined,
        inputSchema: tool.inputSchema,
      })
    }
  }
  return out
}

async function listResources(options: {
  server?: string
}): Promise<McpCliResourceSummary[]> {
  const clients = await getClients()
  const selected = options.server
    ? clients.filter(c => c.name === options.server)
    : clients
  if (options.server && selected.length === 0) {
    throw new Error(
      `Server '${options.server}' not found. Available servers: ${clients.map(c => c.name).join(', ')}`,
    )
  }

  const out: McpCliResourceSummary[] = []
  for (const wrapped of selected) {
    if (wrapped.type !== 'connected') continue
    let capabilities = wrapped.capabilities ?? null
    if (!capabilities) {
      try {
        capabilities = wrapped.client.getServerCapabilities() ?? null
      } catch {
        capabilities = null
      }
      wrapped.capabilities = capabilities
    }
    if (!capabilities?.resources) continue
    const result = await wrapped.client.request(
      { method: 'resources/list' },
      ListResourcesResultSchema,
    )
    for (const resource of result.resources ?? []) {
      out.push({
        server: wrapped.name,
        uri: resource.uri,
        name: resource.name,
        description: resource.description ?? undefined,
        mimeType: resource.mimeType ?? undefined,
      })
    }
  }
  return out
}

export async function runMcpCli(args: {
  argv: string[]
  cwd: string
}): Promise<number> {
  await setCwd(args.cwd)

  const program = new Command()
    .name('mcp-cli')
    .description('Interact with MCP servers and tools')
    .version('1.0.0')

  program
    .command('servers')
    .description('List all connected MCP servers')
    .option('--json', 'Output in JSON format')
    .action(async options => {
      const clients = await getClients()
      const payload = clients.map(client => {
        if (client.type !== 'connected') {
          return { name: client.name, type: client.type }
        }
        let capabilities = client.capabilities ?? null
        if (!capabilities) {
          try {
            capabilities = client.client.getServerCapabilities() ?? null
          } catch {
            capabilities = null
          }
          client.capabilities = capabilities
        }
        return {
          name: client.name,
          type: client.type,
          hasTools: Boolean(capabilities?.tools),
          hasResources: Boolean(capabilities?.resources),
          hasPrompts: Boolean(capabilities?.prompts),
        }
      })

      if (options.json) {
        console.log(toJson(payload))
        return
      }

      for (const server of payload) {
        const status =
          server.type === 'connected'
            ? chalk.green('connected')
            : chalk.red(server.type)
        let extra = ''
        if (server.type === 'connected') {
          const caps = [
            server.hasTools ? 'tools' : null,
            server.hasResources ? 'resources' : null,
            server.hasPrompts ? 'prompts' : null,
          ].filter((v): v is string => Boolean(v))
          if (caps.length > 0) extra = ` (${caps.join(', ')})`
        }
        console.log(`${server.name} - ${status}${extra}`)
      }
    })

  program
    .command('tools')
    .description('List all available tools')
    .argument('[server]', 'Filter by server name')
    .option('--json', 'Output in JSON format')
    .action(async (server, options) => {
      const tools = await listTools({ server: server || undefined })
      if (options.json) {
        console.log(toJson(tools))
        return
      }
      if (server) {
        for (const tool of tools) console.log(tool.name)
        return
      }
      for (const tool of tools) console.log(`${tool.server}/${tool.name}`)
    })

  program
    .command('info')
    .description('Get detailed information about a tool')
    .argument('<tool>', 'Tool identifier in format <server>/<tool>')
    .option('--json', 'Output in JSON format')
    .action(async (toolId, options) => {
      const { server, tool } = parseServerTool(toolId)
      const clients = await getClients()
      const client = getConnectedClient(clients, server)
      const result = await client.client.request(
        { method: 'tools/list' },
        ListToolsResultSchema,
      )
      const found = (result.tools ?? []).find(t => t.name === tool)
      if (!found) {
        throw new Error(`Tool '${tool}' not found on server '${server}'`)
      }
      const payload = {
        server,
        name: found.name,
        description: found.description ?? undefined,
        inputSchema: found.inputSchema,
      }

      if (options.json) {
        console.log(toJson(payload))
        return
      }

      console.log(chalk.bold(`Tool: ${toolId}`))
      console.log(chalk.dim(`Server: ${server}`))
      if (payload.description)
        console.log(chalk.dim(`Description: ${payload.description}`))
      console.log()
      console.log(chalk.bold('Input Schema:'))
      console.log(toPrettyJson(payload.inputSchema ?? {}))
    })

  program
    .command('call')
    .description('Invoke an MCP tool')
    .argument('<tool>', 'Tool identifier in format <server>/<tool>')
    .argument('<args>', 'Tool arguments as JSON string or "-" for stdin')
    .option('--json', 'Output in JSON format')
    .option(
      '--timeout <ms>',
      'Timeout in milliseconds (default: MCP_TOOL_TIMEOUT env var or effectively infinite)',
    )
    .option('--debug', 'Show debug output')
    .action(async (toolId, argsValue, options) => {
      const { server, tool } = parseServerTool(toolId)
      const clients = await getClients()
      const client = getConnectedClient(clients, server)

      let rawArgs = String(argsValue)
      if (rawArgs === '-') {
        rawArgs = await readStdinUtf8()
      }

      let toolArgs: unknown
      try {
        toolArgs = rawArgs ? JSON.parse(rawArgs) : {}
      } catch (error) {
        process.stderr.write(chalk.red('Error: Invalid JSON arguments') + '\n')
        process.stderr.write(
          `${error instanceof Error ? error.message : String(error)}\n`,
        )
        process.exitCode = 1
        return
      }

      const parsedTimeout = Number.parseInt(String(options.timeout ?? ''), 10)
      const envTimeout = Number.parseInt(process.env.MCP_TOOL_TIMEOUT ?? '', 10)
      const timeoutMs =
        Number.isFinite(parsedTimeout) && parsedTimeout > 0
          ? parsedTimeout
          : Number.isFinite(envTimeout) && envTimeout > 0
            ? envTimeout
            : 0

      if (options.debug) {
        process.stderr.write(
          `Connecting to ${server} (${client.type})...\nCalling tool ${tool}...\n`,
        )
      }

      const signal = timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined
      const result = await client.client.request(
        { method: 'tools/call', params: { name: tool, arguments: toolArgs } },
        CallToolResultSchema,
        signal ? { signal } : undefined,
      )

      const outputText = options.json
        ? toJson(result)
        : typeof result === 'string'
          ? result
          : toPrettyJson(result)
      process.stdout.write(outputText + '\n')
    })

  program
    .command('grep')
    .description('Search tool names and descriptions')
    .argument('<pattern>', 'Search pattern')
    .option('--json', 'Output in JSON format')
    .action(async (pattern, options) => {
      const needle = String(pattern ?? '').trim()
      if (!needle) {
        throw new Error('Pattern is required')
      }
      const tools = await listTools({})
      const lower = needle.toLowerCase()
      const matches = tools.filter(tool => {
        const hay =
          `${tool.server}/${tool.name} ${tool.description ?? ''}`.toLowerCase()
        return hay.includes(lower)
      })
      if (options.json) {
        console.log(toJson(matches))
        return
      }
      for (const tool of matches) console.log(`${tool.server}/${tool.name}`)
    })

  program
    .command('resources')
    .description('List MCP resources')
    .argument('[server]', 'Filter by server name')
    .option('--json', 'Output in JSON format')
    .action(async (server, options) => {
      const resources = await listResources({ server: server || undefined })
      if (options.json) {
        console.log(toJson(resources))
        return
      }
      for (const resource of resources) {
        console.log(`${resource.server}/${resource.uri}`)
      }
    })

  program
    .command('read')
    .description('Read an MCP resource')
    .argument('<resource>', 'Resource identifier in format <server>/<uri>')
    .option('--json', 'Output in JSON format')
    .action(async (resourceId, options) => {
      const { server, uri } = parseServerResource(resourceId)
      const clients = await getClients()
      const client = getConnectedClient(clients, server)
      const result = await client.client.request(
        { method: 'resources/read', params: { uri } },
        ReadResourceResultSchema,
      )

      const outputText = options.json
        ? toJson(result)
        : typeof result === 'string'
          ? result
          : toPrettyJson(result)
      process.stdout.write(outputText + '\n')
    })

  try {
    await program.parseAsync(['node', 'mcp-cli', ...args.argv], {
      from: 'user',
    })
    const exitCode =
      typeof process.exitCode === 'number'
        ? process.exitCode
        : typeof process.exitCode === 'string'
          ? Number.parseInt(process.exitCode, 10)
          : 0
    return Number.isFinite(exitCode) ? exitCode : 0
  } catch (error) {
    process.stderr.write(
      chalk.red(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      ) + '\n',
    )
    return 1
  }
}
