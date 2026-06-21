import { zodToJsonSchema } from 'zod-to-json-schema'

import type { ToolSpec } from './splitTool'

export type McpToolInputSchema = Record<string, unknown>

export function getMcpToolDescription(
  tool: Pick<ToolSpec, 'name' | 'cachedDescription' | 'description'>,
): string {
  if (tool.cachedDescription) return tool.cachedDescription
  if (typeof tool.description === 'string') return tool.description
  return `Tool: ${tool.name}`
}

export function getMcpToolInputSchema(
  tool: Pick<ToolSpec, 'inputSchema'>,
): McpToolInputSchema {
  const schema = zodToJsonSchema(tool.inputSchema) as unknown
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return {}
  return schema as McpToolInputSchema
}
