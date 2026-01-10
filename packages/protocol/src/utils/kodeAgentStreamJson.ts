import { makeSdkInitMessage, makeSdkResultMessage } from '../streamJson'
import type { SdkContentBlock, SdkMessage } from '../streamJson'

export type { SdkMessage }
export { makeSdkInitMessage, makeSdkResultMessage }

export type KodeMessage =
  | ({ type: 'progress' } & Record<string, unknown>)
  | ({
      type: 'user'
      uuid: string
      message: { role: string; content: unknown } & Record<string, unknown>
    } & Record<string, unknown>)
  | ({
      type: 'assistant'
      uuid: string
      message: { role: string; content: unknown } & Record<string, unknown>
    } & Record<string, unknown>)

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isProgressMessage(
  value: unknown,
): value is Extract<KodeMessage, { type: 'progress' }> {
  return isRecord(value) && value.type === 'progress'
}

function hasRoleAndContent(
  value: unknown,
): value is { role: string; content: unknown } & Record<string, unknown> {
  if (!isRecord(value)) return false
  return typeof value.role === 'string' && 'content' in value
}

function isUserMessage(
  value: unknown,
): value is Extract<KodeMessage, { type: 'user' }> {
  if (!isRecord(value)) return false
  if (value.type !== 'user') return false
  if (typeof value.uuid !== 'string' || !value.uuid) return false
  return hasRoleAndContent(value.message)
}

function isAssistantMessage(
  value: unknown,
): value is Extract<KodeMessage, { type: 'assistant' }> {
  if (!isRecord(value)) return false
  if (value.type !== 'assistant') return false
  if (typeof value.uuid !== 'string' || !value.uuid) return false
  return hasRoleAndContent(value.message)
}

function isSdkContentBlock(value: unknown): value is SdkContentBlock {
  return isRecord(value) && typeof value.type === 'string'
}

function normalizeToolUseBlockTypes(block: SdkContentBlock): SdkContentBlock {
  if (block.type === 'server_tool_use' || block.type === 'mcp_tool_use') {
    return { ...block, type: 'tool_use' }
  }
  return block
}

function normalizeUserContent(content: unknown): string | SdkContentBlock[] {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.filter(isSdkContentBlock).map(normalizeToolUseBlockTypes)
}

function normalizeAssistantContent(content: unknown): SdkContentBlock[] {
  if (!Array.isArray(content)) return []
  return content.filter(isSdkContentBlock).map(normalizeToolUseBlockTypes)
}

export function kodeMessageToSdkMessage(
  message: unknown,
  sessionId: string,
): SdkMessage | null {
  if (isProgressMessage(message)) return null

  if (isUserMessage(message)) {
    return {
      type: 'user',
      session_id: sessionId,
      uuid: message.uuid,
      parent_tool_use_id: null,
      message: {
        role: 'user',
        content: normalizeUserContent(message.message.content),
      },
    }
  }

  if (isAssistantMessage(message)) {
    return {
      type: 'assistant',
      session_id: sessionId,
      uuid: message.uuid,
      parent_tool_use_id: null,
      message: {
        role: 'assistant',
        content: normalizeAssistantContent(message.message.content),
      },
    }
  }

  return null
}
