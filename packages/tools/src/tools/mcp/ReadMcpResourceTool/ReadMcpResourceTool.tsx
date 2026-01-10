import { Box, Text } from 'ink'
import React from 'react'
import { z } from 'zod'
import type { Tool, ToolUseContext } from '#core/tooling/Tool'
import { getClients, type WrappedClient } from '#core/mcp/client'
import { ReadResourceResultSchema } from '@modelcontextprotocol/sdk/types.js'
import { DESCRIPTION, PROMPT, TOOL_NAME } from './prompt'

const inputSchema = z.strictObject({
  server: z.string().describe('The MCP server name'),
  uri: z.string().describe('The resource URI to read'),
})

type Input = z.infer<typeof inputSchema>

type Output = {
  contents: Array<{
    uri: string
    mimeType?: string
    text?: string
  }>
}

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

export const ReadMcpResourceTool = {
  name: TOOL_NAME,
  async description() {
    return DESCRIPTION
  },
  async prompt() {
    return PROMPT
  },
  inputSchema,
  userFacingName() {
    return 'readMcpResource'
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
    const clients = await getMcpClients(context)
    const match = clients.find(c => c.name === server)
    if (!match) {
      return {
        result: false,
        message: `Server "${server}" not found. Available servers: ${clients.map(c => c.name).join(', ')}`,
        errorCode: 1,
      }
    }
    if (match.type !== 'connected') {
      return {
        result: false,
        message: `Server "${server}" is not connected`,
        errorCode: 2,
      }
    }
    let capabilities = match.capabilities ?? null
    if (!capabilities) {
      try {
        capabilities = match.client.getServerCapabilities() ?? null
      } catch {
        capabilities = null
      }
    }
    if (!capabilities?.resources) {
      return {
        result: false,
        message: `Server "${server}" does not support resources`,
        errorCode: 3,
      }
    }
    return { result: true }
  },
  renderToolUseMessage({ server, uri }: Input) {
    if (!server || !uri) return null
    return `Read resource "${uri}" from server "${server}"`
  },
  renderToolResultMessage(output: Output) {
    const count = output.contents?.length ?? 0
    return (
      <Box flexDirection="row">
        <Text>&nbsp;&nbsp;⎿ &nbsp;</Text>
        <Text bold>Read MCP resource</Text>
        <Text>{count ? ` (${count} part${count === 1 ? '' : 's'})` : ''}</Text>
      </Box>
    )
  },
  renderResultForAssistant(output: Output) {
    return JSON.stringify(output)
  },
  async *call({ server, uri }: Input, context: ToolUseContext) {
    const clients = await getMcpClients(context)
    const match = clients.find(c => c.name === server)
    if (!match) {
      throw new Error(
        `Server "${server}" not found. Available servers: ${clients.map(c => c.name).join(', ')}`,
      )
    }
    if (match.type !== 'connected') {
      throw new Error(`Server "${server}" is not connected`)
    }
    let capabilities = match.capabilities ?? null
    if (!capabilities) {
      try {
        capabilities = match.client.getServerCapabilities() ?? null
      } catch {
        capabilities = null
      }
    }
    if (!capabilities?.resources) {
      throw new Error(`Server "${server}" does not support resources`)
    }
    const result = (await match.client.request(
      { method: 'resources/read', params: { uri } },
      ReadResourceResultSchema,
    )) as Output
    yield {
      type: 'result',
      data: result,
      resultForAssistant: this.renderResultForAssistant(result),
    }
  },
} satisfies Tool<typeof inputSchema, Output>
