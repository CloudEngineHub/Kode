import { Box, Text } from 'ink'
import React from 'react'
import { z } from 'zod'
import type { Tool, ToolUseContext } from '@kode/tool-interface/Tool'
import { getClients, type WrappedClient } from '#core/mcp/client'
import { requestClientPages } from '#core/mcp/client/request'
import { logMCPError } from '#core/utils/log'
import {
  ListResourceTemplatesResultSchema,
  ListResourcesResultSchema,
} from '@modelcontextprotocol/sdk/types.js'
import type {
  ListResourceTemplatesResult,
  ListResourcesResult,
} from '@modelcontextprotocol/sdk/types.js'
import { DESCRIPTION, PROMPT, TOOL_NAME } from './prompt'

const inputSchema = z.strictObject({
  server: z
    .string()
    .optional()
    .describe('Optional server name to filter resources by'),
  includeTemplates: z
    .boolean()
    .optional()
    .default(true)
    .describe('Whether to include MCP resource templates'),
})

type Input = z.infer<typeof inputSchema>

type OutputResourceItem = {
  type: 'resource'
  uri: string
  name: string
  mimeType?: string
  description?: string
  server: string
}

type OutputResourceTemplateItem = {
  type: 'resource_template'
  uriTemplate: string
  name: string
  mimeType?: string
  description?: string
  server: string
}

type OutputItem = OutputResourceItem | OutputResourceTemplateItem
type Output = OutputItem[]
type ListedResource = Omit<OutputResourceItem, 'server' | 'type'>
type ListedResourceTemplate = Omit<
  OutputResourceTemplateItem,
  'server' | 'type'
>

function isWrappedClient(value: unknown): value is WrappedClient {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  if (typeof record.name !== 'string') return false
  if (
    record.type !== 'connected' &&
    record.type !== 'failed' &&
    record.type !== 'needs-auth'
  )
    return false
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
  renderToolUseMessage({ server, includeTemplates }: Input) {
    const suffix = includeTemplates === false ? '' : ' and templates'
    return server
      ? `List MCP resources${suffix} from server "${server}"`
      : `List all MCP resources${suffix}`
  },
  renderToolResultMessage(output: Output) {
    const resourceCount = output.filter(item => item.type === 'resource').length
    const templateCount = output.filter(
      item => item.type === 'resource_template',
    ).length
    return (
      <Box flexDirection="row">
        <Text>&nbsp;&nbsp;⎿ &nbsp;</Text>
        <Text bold>{resourceCount}</Text>
        <Text> resources</Text>
        {templateCount > 0 ? (
          <>
            <Text>, </Text>
            <Text bold>{templateCount}</Text>
            <Text> templates</Text>
          </>
        ) : null}
      </Box>
    )
  },
  renderResultForAssistant(output: Output) {
    return JSON.stringify(output)
  },
  async *call({ server, includeTemplates }: Input, context: ToolUseContext) {
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
      let supportsResources = false
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
        supportsResources = true
        const results = await requestClientPages<
          ListResourcesResult,
          typeof ListResourcesResultSchema
        >(wrapped, { method: 'resources/list' }, ListResourcesResultSchema)
        resources.push(
          ...results.flatMap(result =>
            ((result.resources ?? []) as ListedResource[]).map(r => ({
              ...r,
              type: 'resource' as const,
              server: wrapped.name,
            })),
          ),
        )
      } catch (error) {
        logMCPError(
          wrapped.name,
          `Failed to list resources: ${error instanceof Error ? error.message : String(error)}`,
        )
      }

      if (supportsResources && includeTemplates !== false) {
        try {
          const templateResults = await requestClientPages<
            ListResourceTemplatesResult,
            typeof ListResourceTemplatesResultSchema
          >(
            wrapped,
            { method: 'resources/templates/list' },
            ListResourceTemplatesResultSchema,
          )
          resources.push(
            ...templateResults.flatMap(result =>
              (
                (result.resourceTemplates ?? []) as ListedResourceTemplate[]
              ).map(template => ({
                ...template,
                type: 'resource_template' as const,
                server: wrapped.name,
              })),
            ),
          )
        } catch (error) {
          logMCPError(
            wrapped.name,
            `Failed to list resource templates: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }
    }

    yield {
      type: 'result',
      data: resources,
      resultForAssistant: this.renderResultForAssistant(resources),
    }
  },
} satisfies Tool<typeof inputSchema, Output>
