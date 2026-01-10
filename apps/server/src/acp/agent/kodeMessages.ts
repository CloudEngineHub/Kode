import type { ContentBlock } from '@anthropic-ai/sdk/resources/index.mjs'

import type { Message } from '#core/query'

import type { JsonRpcPeer } from '../jsonrpc'
import type * as Protocol from '../protocol'

import {
  asJsonObject,
  extractAssistantText,
  extractToolResults,
  toolKindForName,
  titleForToolCall,
} from './content'
import { isRecord } from './guards'
import {
  sendAgentMessageChunk,
  sendAgentThoughtChunk,
  sendToolCall,
  sendToolCallUpdate,
  sendUserMessageChunk,
} from './notifications'
import type { SessionState } from './types'
import { buildDiffContentForToolResult } from './toolCalls'

function toInputRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function emitAssistantContentBlocks(
  peer: JsonRpcPeer,
  session: SessionState,
  blocks: ContentBlock[],
): void {
  for (const block of blocks) {
    switch (block.type) {
      case 'text':
        sendAgentMessageChunk(peer, session.sessionId, block.text)
        break
      case 'thinking':
        sendAgentThoughtChunk(peer, session.sessionId, block.thinking)
        break
      case 'tool_use': {
        const toolUseId = typeof block.id === 'string' ? block.id : ''
        const toolName = typeof block.name === 'string' ? block.name : ''
        if (!toolUseId || !toolName) break

        if (!session.toolCalls.has(toolUseId)) {
          const input = toInputRecord(block.input)
          const kind = toolKindForName(toolName)
          const title = titleForToolCall(toolName, input)

          session.toolCalls.set(toolUseId, {
            title,
            kind,
            status: 'pending',
            rawInput: asJsonObject(input),
          })

          sendToolCall(peer, session.sessionId, {
            sessionUpdate: 'tool_call',
            toolCallId: toolUseId,
            title,
            kind,
            status: 'pending',
            rawInput: asJsonObject(input),
          } satisfies Protocol.ToolCall)
        }
        break
      }
      default:
        break
    }
  }
}

export async function handleKodeMessage(args: {
  peer: JsonRpcPeer
  session: SessionState
  message: Message
}): Promise<void> {
  const { peer, session, message: m } = args
  if (!m || typeof m !== 'object') return

  if (m.type === 'assistant') {
    session.messages.push(m)
    emitAssistantContentBlocks(peer, session, m.message.content)
    return
  }

  if (m.type === 'progress') {
    const toolCallId = m.toolUseID
    const existing = session.toolCalls.get(toolCallId)
    const title = existing?.title ?? 'Tool'
    const kind = existing?.kind ?? 'other'

    if (!existing || existing.status === 'pending') {
      session.toolCalls.set(toolCallId, {
        title,
        kind,
        status: 'in_progress',
        rawInput: existing?.rawInput,
      })
      sendToolCallUpdate(peer, session.sessionId, {
        toolCallId,
        status: 'in_progress',
      })
    }

    const text = extractAssistantText(m.content)
    if (text) {
      sendToolCallUpdate(peer, session.sessionId, {
        toolCallId,
        content: [
          {
            type: 'content',
            content: { type: 'text', text },
          },
        ],
      })
    }
    return
  }

  if (m.type === 'user') {
    const toolResults = extractToolResults(m)
    if (toolResults.length === 0) {
      session.messages.push(m)
      return
    }

    for (const tr of toolResults) {
      const existing = session.toolCalls.get(tr.toolUseId)
      const title = existing?.title ?? 'Tool'
      const kind = existing?.kind ?? 'other'

      if (!existing || existing.status === 'pending') {
        session.toolCalls.set(tr.toolUseId, {
          title,
          kind,
          status: 'in_progress',
          rawInput: existing?.rawInput,
        })
        sendToolCallUpdate(peer, session.sessionId, {
          toolCallId: tr.toolUseId,
          status: 'in_progress',
        })
      }

      const status: Protocol.ToolCallStatus = tr.isError
        ? 'failed'
        : 'completed'
      session.toolCalls.set(tr.toolUseId, {
        title,
        kind,
        status,
        rawInput: existing?.rawInput,
      })

      const rawOutput = asJsonObject(m.toolUseResult?.data)

      const content: Protocol.ToolCallContent[] = []
      const diffContent =
        status === 'completed'
          ? buildDiffContentForToolResult({
              session,
              toolUseId: tr.toolUseId,
              rawOutput,
            })
          : null
      if (diffContent) content.push(diffContent)
      if (tr.content) {
        content.push({
          type: 'content',
          content: { type: 'text', text: tr.content },
        })
      }

      sendToolCallUpdate(peer, session.sessionId, {
        toolCallId: tr.toolUseId,
        status,
        ...(content.length > 0 ? { content } : {}),
        ...(rawOutput ? { rawOutput } : {}),
      })
    }

    session.messages.push(m)
  }
}

export function replayConversation(
  peer: JsonRpcPeer,
  session: SessionState,
): void {
  session.toolCalls.clear()

  for (const m of session.messages) {
    if (!m || typeof m !== 'object') continue

    if (m.type === 'assistant') {
      emitAssistantContentBlocks(peer, session, m.message.content)
      continue
    }

    if (m.type === 'user') {
      if (typeof m.message.content === 'string' && m.message.content.trim()) {
        sendUserMessageChunk(peer, session.sessionId, m.message.content)
      }

      const toolResults = extractToolResults(m)
      if (toolResults.length === 0) continue

      for (const tr of toolResults) {
        const existing = session.toolCalls.get(tr.toolUseId)
        const title = existing?.title ?? 'Tool'
        const kind = existing?.kind ?? 'other'

        if (!existing) {
          session.toolCalls.set(tr.toolUseId, {
            title,
            kind,
            status: 'pending',
          })
          sendToolCall(peer, session.sessionId, {
            sessionUpdate: 'tool_call',
            toolCallId: tr.toolUseId,
            title,
            kind,
            status: 'pending',
          } satisfies Protocol.ToolCall)
        }

        const status: Protocol.ToolCallStatus = tr.isError
          ? 'failed'
          : 'completed'
        const contentBlocks: Protocol.ToolCallContent[] = []
        if (tr.content) {
          contentBlocks.push({
            type: 'content',
            content: { type: 'text', text: tr.content },
          })
        }

        const rawOutput = asJsonObject(m.toolUseResult?.data)

        sendToolCallUpdate(peer, session.sessionId, {
          toolCallId: tr.toolUseId,
          status,
          ...(contentBlocks.length > 0 ? { content: contentBlocks } : {}),
          ...(rawOutput ? { rawOutput } : {}),
        })

        session.toolCalls.set(tr.toolUseId, {
          title,
          kind,
          status,
          rawInput: existing?.rawInput,
        })
      }
    }
  }
}
