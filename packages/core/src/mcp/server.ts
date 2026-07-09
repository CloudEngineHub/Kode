import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { setCwd } from '#core/utils/state'
import { logError } from '#core/utils/log'
import { createAssistantMessage } from '#core/utils/messages'
import {
  resolveToolDescription,
  type Tool,
  type ToolUseContext,
} from '#core/tooling/Tool'
import { MACRO } from '#core/constants/macros'
import { splitLegacyTool } from '#core/tooling/splitTool'
import {
  getMcpToolDescription,
  getMcpToolInputSchema,
} from '#core/tooling/mcpToolSchema'
import { LEGACY_ENV } from '#core/compat/legacyEnv'

const state: {
  readFileTimestamps: Record<string, number>
} = {
  readFileTimestamps: {},
}

const MCP_COMMANDS: unknown[] = []
const MCP_SERVER_PROGRESS_MESSAGE_MAX_LENGTH = 240
const MCP_SERVER_PROGRESS_MIN_INTERVAL_MS = 250

type McpProgressToken = string | number
type McpProgressNotification = {
  method: 'notifications/progress'
  params: {
    progressToken: McpProgressToken
    progress: number
    message?: string
  }
}

type McpProgressExtra = {
  _meta?: { progressToken?: unknown }
  sendNotification(notification: McpProgressNotification): Promise<void>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function getMcpProgressToken(extra: McpProgressExtra): McpProgressToken | null {
  const token = extra._meta?.progressToken
  return typeof token === 'string' || typeof token === 'number' ? token : null
}

function sanitizeMcpProgressMessage(value: string): string | undefined {
  const cleaned = value
    .replace(/<\/?tool-progress>/g, '')
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned) return undefined
  if (cleaned.length <= MCP_SERVER_PROGRESS_MESSAGE_MAX_LENGTH) return cleaned
  return `${cleaned.slice(0, MCP_SERVER_PROGRESS_MESSAGE_MAX_LENGTH)}...`
}

function extractText(value: unknown, depth = 0): string | null {
  if (depth > 4) return null
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    const text = value
      .map(item => extractText(item, depth + 1))
      .filter((item): item is string => Boolean(item))
      .join('\n')
    return text || null
  }
  if (!isRecord(value)) return null

  if (typeof value.text === 'string') return value.text

  for (const key of ['content', 'message', 'event']) {
    const nested = extractText(value[key], depth + 1)
    if (nested) return nested
  }

  return null
}

function formatMcpProgressMessage(update: unknown, toolName: string): string {
  const record = isRecord(update) ? update : null
  const candidate = record?.content ?? record?.event ?? update
  const text =
    extractText(candidate) ??
    (() => {
      try {
        return JSON.stringify(candidate)
      } catch {
        return String(candidate)
      }
    })()

  return sanitizeMcpProgressMessage(text) ?? `Tool ${toolName} is running`
}

function createMcpProgressReporter(
  extra: McpProgressExtra,
  toolName: string,
): (update: unknown) => Promise<void> {
  const progressToken = getMcpProgressToken(extra)
  if (progressToken === null) return async () => {}

  let progress = 0
  let lastSentAt = 0

  return async update => {
    const now = Date.now()
    if (
      lastSentAt > 0 &&
      now - lastSentAt < MCP_SERVER_PROGRESS_MIN_INTERVAL_MS
    ) {
      return
    }

    progress += 1
    lastSentAt = now

    try {
      await extra.sendNotification({
        method: 'notifications/progress',
        params: {
          progressToken,
          progress,
          message: formatMcpProgressMessage(update, toolName),
        },
      })
    } catch (error) {
      logError(error)
    }
  }
}

export const __createMcpProgressReporterForTests = createMcpProgressReporter

function createLinkedMcpAbortController(signal: AbortSignal): {
  abortController: AbortController
  cleanup(): void
} {
  const abortController = new AbortController()
  const abort = () => {
    abortController.abort(signal.reason ?? new Error('MCP request cancelled'))
  }

  if (signal.aborted) {
    abort()
  } else {
    signal.addEventListener('abort', abort, { once: true })
  }

  return {
    abortController,
    cleanup() {
      signal.removeEventListener('abort', abort)
    },
  }
}

export const __createLinkedMcpAbortControllerForTests =
  createLinkedMcpAbortController

function getMcpServerName(): string {
  const raw =
    process.env.KODE_MCP_SERVER_NAME ??
    process.env.MCP_SERVER_NAME ??
    process.env[LEGACY_ENV.codeMcpServerName] ??
    ''
  const trimmed = typeof raw === 'string' ? raw.trim() : ''
  return trimmed || 'kode/tengu'
}

export async function startMCPServer(
  cwd: string,
  tools: Iterable<Tool>,
): Promise<void> {
  await setCwd(cwd)
  const MCP_TOOLS: Tool[] = [...tools]
  await Promise.all(MCP_TOOLS.map(tool => resolveToolDescription(tool)))
  const server = new Server(
    {
      // Allow legacy clients to override the server identifier while keeping a Kode-first default.
      name: getMcpServerName(),
      version: MACRO.VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: await Promise.all(
      MCP_TOOLS.map(async tool => {
        const spec = splitLegacyTool(tool).spec
        return {
          name: spec.name,
          description: getMcpToolDescription(spec),
          inputSchema: getMcpToolInputSchema(spec),
        }
      }),
    ),
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const { name, arguments: args } = request.params
    const tool = MCP_TOOLS.find(_ => _.name === name)
    if (!tool) {
      return {
        isError: true,
        content: [
          { type: 'text' as const, text: `Error: Tool ${name} not found` },
        ],
      }
    }

    const linkedAbort = createLinkedMcpAbortController(extra.signal)

    try {
      const toolInput: Record<string, unknown> =
        args && typeof args === 'object'
          ? (args as Record<string, unknown>)
          : {}
      if (linkedAbort.abortController.signal.aborted) {
        throw new Error('Tool request cancelled')
      }
      if (!(await tool.isEnabled())) {
        throw new Error(`Tool ${name} is not enabled`)
      }

      const toolUseContext: ToolUseContext = {
        abortController: linkedAbort.abortController,
        options: {
          commands: MCP_COMMANDS,
          tools: MCP_TOOLS,
          forkNumber: 0,
          messageLogName: 'mcp',
          maxThinkingTokens: 0,
          shouldAvoidPermissionPrompts: true,
          persistSession: false,
        },
        messageId: undefined,
        readFileTimestamps: state.readFileTimestamps,
      }

      const validationResult = await tool.validateInput?.(
        toolInput as never,
        toolUseContext,
      )
      if (validationResult && !validationResult.result) {
        throw new Error(
          `Tool ${name} input is invalid: ${validationResult.message}`,
        )
      }

      // Permission policy lives in core and is tool-aware; MCP is headless, so prompts must fail closed.
      const assistantMessage = createAssistantMessage('')
      const permission = await (
        await import('#core/permissions')
      ).hasPermissionsToUseTool(
        tool,
        toolInput,
        toolUseContext,
        assistantMessage,
      )
      if (permission.result !== true) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `Error: ${permission.message ?? 'Permission denied'}`,
            },
          ],
        }
      }

      const result = tool.call(toolInput as never, toolUseContext)
      const reportProgress = createMcpProgressReporter(extra, name)
      let finalResult: Awaited<ReturnType<typeof result.next>>['value']

      for await (const update of result) {
        if (isRecord(update) && update.type === 'progress') {
          await reportProgress(update)
        }
        finalResult = update
      }

      if (!finalResult || finalResult.type !== 'result') {
        throw new Error(`Tool ${name} did not return a result`)
      }

      const payload =
        finalResult.resultForAssistant ??
        tool.renderResultForAssistant(finalResult.data)

      const text =
        typeof payload === 'string'
          ? payload
          : Array.isArray(payload)
            ? JSON.stringify(payload)
            : JSON.stringify(finalResult.data)

      return {
        content: [{ type: 'text' as const, text }],
      }
    } catch (error) {
      logError(error)
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      }
    } finally {
      linkedAbort.cleanup()
    }
  })

  async function runServer() {
    const transport = new StdioServerTransport()
    await server.connect(transport)
  }

  return await runServer()
}
