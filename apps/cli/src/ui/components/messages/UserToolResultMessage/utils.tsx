import { ToolUseBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import { Message } from '#core/query'
import { useMemo } from 'react'
import { Tool } from '#core/tooling/Tool'
import { GlobTool } from '#tools/tools/filesystem/GlobTool/GlobTool'
import { GrepTool } from '#tools/tools/search/GrepTool/GrepTool'

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  if (Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function toToolUseBlockParam(value: unknown): ToolUseBlockParam | null {
  const record = asRecord(value)
  if (!record) return null
  const type = record.type
  if (
    type !== 'tool_use' &&
    type !== 'server_tool_use' &&
    type !== 'mcp_tool_use'
  ) {
    return null
  }
  const id = typeof record.id === 'string' ? record.id : null
  const name = typeof record.name === 'string' ? record.name : null
  if (!id || !name) return null
  return { type: 'tool_use', id, name, input: record.input }
}

function getToolUseFromMessages(
  toolUseID: string,
  messages: Message[],
): ToolUseBlockParam | null {
  let toolUse: ToolUseBlockParam | null = null
  for (const message of messages) {
    if (
      message.type !== 'assistant' ||
      !Array.isArray(message.message.content)
    ) {
      continue
    }
    for (const content of message.message.content) {
      const block = toToolUseBlockParam(content)
      if (!block) continue
      if (block.id === toolUseID) toolUse = block
    }
  }
  return toolUse
}

export function useGetToolFromMessages(
  toolUseID: string,
  tools: Tool[],
  messages: Message[],
) {
  return useMemo(() => {
    const toolUse = getToolUseFromMessages(toolUseID, messages)
    if (!toolUse) {
      throw new ReferenceError(
        `Tool use not found for tool_use_id ${toolUseID}`,
      )
    }
    // Hack: we don't expose GlobTool and GrepTool in getTools anymore,
    // but we still want to be able to load old transcripts.
    // NOTE: keep legacy Glob/Grep lookup for transcript compatibility.
    const tool = [...tools, GlobTool, GrepTool].find(
      _ => _.name === toolUse.name,
    )
    if (tool === GlobTool || tool === GrepTool) {
    }
    if (!tool) {
      throw new ReferenceError(`Tool not found for ${toolUse.name}`)
    }
    return { tool, toolUse }
  }, [toolUseID, messages, tools])
}
