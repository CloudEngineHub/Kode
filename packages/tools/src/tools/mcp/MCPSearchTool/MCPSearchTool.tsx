import { Box, Text } from 'ink'
import React from 'react'
import { z } from 'zod'
import type { Tool, ToolUseContext } from '#core/tooling/Tool'
import { getTheme } from '#core/utils/theme'
import { DESCRIPTION, getPrompt, TOOL_NAME_FOR_PROMPT } from './prompt'

const inputSchema = z.object({
  query: z
    .string()
    .describe(
      'Query to find MCP tools. Use "select:<tool_name>" for direct selection, or keywords to search.',
    ),
  max_results: z
    .number()
    .optional()
    .default(5)
    .describe('Maximum number of results to return (default: 5)'),
})

type Input = z.infer<typeof inputSchema>

type Output = {
  matches: string[]
  query: string
  total_mcp_tools: number
}

type ToolReferenceBlock = {
  type: 'tool_reference'
  tool_name: string
}

function isToolLike(value: unknown): value is Tool {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as Tool).name === 'string' &&
    typeof (value as Tool).prompt === 'function'
  )
}

function getMcpToolsFromContext(context: ToolUseContext): Tool[] {
  const tools = context.options?.tools
  if (!Array.isArray(tools)) return []
  return tools.filter(isToolLike).filter(tool => tool.isMcp === true)
}

function signatureForTools(tools: Tool[]): string {
  return tools
    .map(tool => tool.name)
    .sort()
    .join(',')
}

const promptCache = new Map<string, string>()
let lastMcpToolsSignature: string | null = null

async function getCachedToolPrompt(tool: Tool, tools: Tool[]): Promise<string> {
  const cached = promptCache.get(tool.name)
  if (cached !== undefined) return cached
  const prompt = await tool.prompt({ tools })
  promptCache.set(tool.name, prompt)
  return prompt
}

async function keywordSearch(args: {
  query: string
  mcpTools: Tool[]
  tools: Tool[]
  maxResults: number
}): Promise<string[]> {
  const keywords = args.query.toLowerCase().split(/\s+/).filter(Boolean)

  const scored = await Promise.all(
    args.mcpTools.map(async tool => {
      const normalizedName = tool.name.toLowerCase().replace(/__/g, ' ')
      const normalizedPrompt = (
        await getCachedToolPrompt(tool, args.tools)
      ).toLowerCase()

      let score = 0
      for (const keyword of keywords) {
        if (normalizedName === keyword) score += 10
        else if (normalizedName.includes(keyword)) score += 5
        if (normalizedPrompt.includes(keyword)) score += 2
      }

      return { name: tool.name, score }
    }),
  )

  return scored
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, args.maxResults)
    .map(item => item.name)
}

export const MCPSearchTool = {
  name: TOOL_NAME_FOR_PROMPT,
  async description() {
    return DESCRIPTION
  },
  async prompt(options?: { safeMode?: boolean; tools?: Tool[] }) {
    return getPrompt(options?.tools)
  },
  inputSchema,
  isReadOnly() {
    return true
  },
  isConcurrencySafe() {
    return true
  },
  async isEnabled() {
    return true
  },
  needsPermissions() {
    return false
  },
  userFacingName() {
    return TOOL_NAME_FOR_PROMPT
  },
  renderToolUseMessage(input: Input) {
    return `Search MCP tools: "${input.query ?? '...'}"`
  },
  renderToolUseRejectedMessage() {
    return null
  },
  renderToolResultMessage(output: Output) {
    const theme = getTheme()
    if (output.matches.length === 0) {
      return (
        <Box flexDirection="row">
          <Text color={theme.text}>  ⎿  </Text>
          <Text dimColor>No matching MCP tools found</Text>
        </Box>
      )
    }
    return (
      <Box flexDirection="row">
        <Text color={theme.text}>  ⎿  </Text>
        <Text>
          Found <Text bold>{output.matches.length}</Text>{' '}
          {output.matches.length === 1 ? 'tool' : 'tools'}
        </Text>
      </Box>
    )
  },
  renderResultForAssistant(output: Output): ToolReferenceBlock[] {
    return output.matches.map(toolName => ({
      type: 'tool_reference',
      tool_name: toolName,
    }))
  },
  async *call({ query, max_results }: Input, context: ToolUseContext) {
    const tools = Array.isArray(context.options?.tools)
      ? context.options.tools.filter(isToolLike)
      : []
    const mcpTools = getMcpToolsFromContext(context)

    const nextSignature = signatureForTools(mcpTools)
    if (lastMcpToolsSignature !== nextSignature) {
      promptCache.clear()
      lastMcpToolsSignature = nextSignature
    }

    const selectMatch = query.match(/^select:(.+)$/i)
    if (selectMatch) {
      const wanted = selectMatch[1]?.trim()
      const found = wanted
        ? mcpTools.find(tool => tool.name === wanted)
        : undefined

      const output: Output = {
        matches: found ? [found.name] : [],
        query,
        total_mcp_tools: mcpTools.length,
      }

      yield {
        type: 'result',
        data: output,
        resultForAssistant: this.renderResultForAssistant(output),
      }
      return
    }

    const matches = await keywordSearch({
      query,
      mcpTools,
      tools,
      maxResults: max_results ?? 5,
    })

    const output: Output = {
      matches,
      query,
      total_mcp_tools: mcpTools.length,
    }

    yield {
      type: 'result',
      data: output,
      resultForAssistant: this.renderResultForAssistant(output),
    }
  },
} satisfies Tool<typeof inputSchema, Output>
