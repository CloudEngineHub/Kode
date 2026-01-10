import { Box, Text } from 'ink'
import React from 'react'
import { z } from 'zod'
import type { Tool, ToolUseContext } from '#core/tooling/Tool'
import { getClients, type WrappedClient } from '#core/mcp/client'
import { ListResourcesResultSchema } from '@modelcontextprotocol/sdk/types.js'
import { DESCRIPTION, PROMPT, TOOL_NAME } from './prompt'

const inputSchema = z.strictObject({
  server: z
    .string()
    .optional()
    .describe('Optional server name to filter resources by'),
})

type Input = z.infer<typeof inputSchema>

type OutputItem = {
  uri: string
  name: string
  mimeType?: string
  description?: string
  server: string
}

type Output = OutputItem[]

function isWrappedClient(value: unknown): value is WrappedClient {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  if (typeof record.name !== 'string') return false
  if (record.type !== 'connected' && record.type !== 'failed') return false
  if (record.type === 'connected') {
    return typeof record.client === 'object' && record.client !== null
  }
  return true
}

async function getMcpClients(
  context?: ToolUseContext,
): Promise<WrappedClient[]> {
  const override = context?.options?.mcpClients
  if (Array.isArray(override) && override.every(isWrappedClient)) {
    return override
  }
  return await getClients()
}

export const ListMcpResourcesTool = {
  name: TOOL_NAME,
  async description() {
    return DESCRIPTION
  },
  async prompt() {
    return PROMPT
  },
  inputSchema,
  userFacingName() {
    return 'listMcpResources'
  },
  async isEnabled() {
    return true
  },
  isReadOnly() {
    return true
  },
  isConcurrencySafe() {
    return true
  },
  needsPermissions() {
    return false
  },
  async validateInput({ server }: Input, context?: ToolUseContext) {
    if (!server) return { result: true }
    const clients = await getMcpClients(context)
    const found = clients.some(c => c.name === server)
    if (!found) {
      return {
        result: false,
        message: `Server "${server}" not found. Available servers: ${clients.map(c => c.name).join(', ')}`,
        errorCode: 1,
      }
    }
    return { result: true }
  },
  renderToolUseMessage({ server }: Input) {
    return server
      ? `List MCP resources from server "${server}"`
      : 'List all MCP resources'
  },
  renderToolResultMessage(output: Output) {
    return (
      <Box flexDirection="row">
        <Text>&nbsp;&nbsp;⎿ &nbsp;</Text>
        <Text bold>{output.length}</Text>
        <Text> resources</Text>
      </Box>
    )
  },
  renderResultForAssistant(output: Output) {
    return JSON.stringify(output)
  },
  async *call({ server }: Input, context: ToolUseContext) {
    const clients = await getMcpClients(context)
    const selected = server ? clients.filter(c => c.name === server) : clients
    if (server && selected.length === 0) {
      throw new Error(
        `Server "${server}" not found. Available servers: ${clients.map(c => c.name).join(', ')}`,
      )
    }

    const resources: OutputItem[] = []
    for (const wrapped of selected) {
      if (wrapped.type !== 'connected') continue
      try {
        let capabilities = wrapped.capabilities ?? null
        if (!capabilities) {
          try {
            capabilities = wrapped.client.getServerCapabilities() ?? null
          } catch {
            capabilities = null
          }
        }
        if (!capabilities?.resources) continue
        const result = await wrapped.client.request(
          { method: 'resources/list' },
          ListResourcesResultSchema,
        )
        if (!result.resources) continue
        resources.push(
          ...result.resources.map(r => ({
            ...r,
            server: wrapped.name,
          })),
        )
      } catch {
        // Best-effort: skip servers that fail to respond
      }
    }

    yield {
      type: 'result',
      data: resources,
      resultForAssistant: this.renderResultForAssistant(resources),
    }
  },
} satisfies Tool<typeof inputSchema, Output>
