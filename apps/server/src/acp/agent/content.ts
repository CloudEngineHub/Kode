import type {
  ContentBlockParam,
  TextBlockParam,
} from '@anthropic-ai/sdk/resources/index.mjs'

import type { AssistantMessage, UserMessage } from '#core/query'
import { resolveToolNameAlias } from '#core/utils/toolNameAliases'

import type * as Protocol from '../protocol'
import { isRecord } from './guards'

export function asJsonObject(value: unknown): Protocol.JsonObject | undefined {
  if (!isRecord(value)) return undefined
  try {
    JSON.stringify(value)
    return value as Protocol.JsonObject
  } catch {
    return undefined
  }
}

export function toolKindForName(toolName: string): Protocol.ToolKind {
  const resolved = resolveToolNameAlias(toolName).resolvedName
  switch (resolved) {
    case 'Read':
      return 'read'
    case 'Write':
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return 'edit'
    case 'Grep':
    case 'Glob':
      return 'search'
    case 'Bash':
    case 'TaskOutput':
    case 'TaskStop':
      return 'execute'
    case 'SwitchModel':
      return 'switch_mode'
    default:
      return 'other'
  }
}

export function titleForToolCall(
  toolName: string,
  input: Record<string, unknown>,
): string {
  if (toolName === 'Read' && typeof input.file_path === 'string') {
    return `Read ${input.file_path}`
  }
  if (
    (toolName === 'Write' || toolName === 'Edit' || toolName === 'MultiEdit') &&
    typeof input.file_path === 'string'
  ) {
    return `${toolName} ${input.file_path}`
  }
  if (toolName === 'Bash' && typeof input.command === 'string') {
    const cmd = input.command.trim().replace(/\s+/g, ' ')
    const clipped = cmd.length > 120 ? `${cmd.slice(0, 117)}...` : cmd
    return `Run ${clipped}`
  }
  return toolName
}

export function blocksToText(blocks: Protocol.ContentBlock[]): string {
  const parts: string[] = []

  for (const block of blocks) {
    switch (block.type) {
      case 'text': {
        const text = typeof block.text === 'string' ? block.text : ''
        if (text) parts.push(text)
        break
      }
      case 'resource': {
        const resource = block.resource
        const uri = resource.uri
        const mimeType = resource.mimeType?.trim() || 'text/plain'

        if (typeof resource.text === 'string') {
          parts.push(
            [
              '',
              `@resource ${uri} (${mimeType})`,
              '```',
              resource.text,
              '```',
            ].join('\n'),
          )
        } else if (typeof resource.blob === 'string') {
          parts.push(
            ['', `@resource ${uri} (${mimeType}) [base64]`, resource.blob].join(
              '\n',
            ),
          )
        } else if (uri) {
          parts.push(`@resource ${uri} (${mimeType})`)
        }
        break
      }
      case 'resource_link': {
        const uri = block.uri
        const name = block.name
        const title = block.title ?? ''
        const description = block.description ?? ''

        parts.push(
          [
            '',
            `@resource_link ${name || uri}`,
            ...(title ? [title] : []),
            ...(description ? [description] : []),
            ...(uri ? [uri] : []),
          ].join('\n'),
        )
        break
      }
      case 'image':
      case 'audio': {
        break
      }
      default:
        break
    }
  }

  return parts.join('\n').trim()
}

export function extractAssistantText(msg: AssistantMessage): string {
  const texts: string[] = []
  for (const block of msg.message.content) {
    if (block.type === 'text') texts.push(block.text)
    if (block.type === 'thinking') texts.push(block.thinking)
  }
  return texts.join('').trim()
}

export function extractToolUses(
  msg: AssistantMessage,
): Array<{ id: string; name: string; input: Record<string, unknown> }> {
  const out: Array<{
    id: string
    name: string
    input: Record<string, unknown>
  }> = []

  for (const block of msg.message.content) {
    if (block.type !== 'tool_use') continue
    const input = isRecord(block.input) ? block.input : {}
    if (block.id && block.name)
      out.push({ id: block.id, name: block.name, input })
  }

  return out
}

function isTextBlockParam(value: unknown): value is TextBlockParam {
  return (
    isRecord(value) && value.type === 'text' && typeof value.text === 'string'
  )
}

export function extractToolResults(
  msg: UserMessage,
): Array<{ toolUseId: string; isError: boolean; content: string }> {
  const content: string | Array<ContentBlockParam> = msg.message.content
  if (!Array.isArray(content)) return []

  const out: Array<{ toolUseId: string; isError: boolean; content: string }> =
    []

  for (const block of content) {
    if (block.type !== 'tool_result') continue
    const toolUseId = block.tool_use_id
    const isError = Boolean(block.is_error)
    const raw = block.content
    const text =
      typeof raw === 'string'
        ? raw
        : Array.isArray(raw)
          ? raw
              .filter(isTextBlockParam)
              .map(x => x.text)
              .join('')
          : ''
    if (toolUseId) out.push({ toolUseId, isError, content: text })
  }

  return out
}
