import { nanoid } from 'nanoid'

import { hasPermissionsToUseTool } from '#core/permissions'
import type { CanUseToolFn } from '#core/permissions/canUseTool'
import {
  applyToolPermissionContextUpdates,
  type ToolPermissionContextUpdate,
} from '#core/types/toolPermissionContext'
import { logError } from '#core/utils/log'
import { persistToolPermissionUpdateToDisk } from '#core/utils/permissions/toolPermissionSettings'

import type { JsonRpcPeer } from '../jsonrpc'
import type * as Protocol from '../protocol'

import { asJsonObject, titleForToolCall, toolKindForName } from './content'
import { sendToolCall, sendToolCallUpdate } from './notifications'
import { captureFileSnapshotForTool } from './toolCalls'
import type { SessionState } from './types'

function getPermissionTimeoutMs(): number {
  const raw = process.env.KODE_ACP_PERMISSION_TIMEOUT_MS
  const parsed = raw ? Number(raw) : Number.NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30_000
}

function toPermissionOptions(denied: {
  suggestions?: ToolPermissionContextUpdate[]
}): Protocol.PermissionOption[] {
  const options: Protocol.PermissionOption[] = [
    { optionId: 'allow_once', name: 'Allow once', kind: 'allow_once' },
    { optionId: 'reject_once', name: 'Reject', kind: 'reject_once' },
  ]

  if ((denied.suggestions ?? []).length > 0) {
    options.splice(1, 0, {
      optionId: 'allow_always',
      name: 'Allow always (remember)',
      kind: 'allow_always',
    })
  }

  return options
}

export function createAcpCanUseTool(args: {
  peer: JsonRpcPeer
  session: SessionState
}): CanUseToolFn {
  const timeoutMs = getPermissionTimeoutMs()
  const { peer, session } = args

  return async (tool, input, toolUseContext, assistantMessage) => {
    const toolUseId =
      typeof toolUseContext.toolUseId === 'string' && toolUseContext.toolUseId
        ? toolUseContext.toolUseId
        : `call_${nanoid()}`

    const base = await hasPermissionsToUseTool(
      tool,
      input,
      toolUseContext,
      assistantMessage,
    )

    if (base.result === true) {
      captureFileSnapshotForTool({
        session,
        toolUseId,
        toolName: tool.name,
        input,
      })
      return base
    }

    const denied = base
    if (denied.shouldPromptUser === false) {
      return { result: false as const, message: denied.message }
    }

    const title = titleForToolCall(tool.name, input)
    const kind = toolKindForName(tool.name)

    if (!session.toolCalls.has(toolUseId)) {
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

    const options = toPermissionOptions(denied)

    try {
      const response =
        await peer.sendRequest<Protocol.RequestPermissionResponse>({
          method: 'session/request_permission',
          params: {
            sessionId: session.sessionId,
            toolCall: {
              toolCallId: toolUseId,
              title,
              kind,
              status: 'pending',
              content: [
                {
                  type: 'content',
                  content: { type: 'text', text: denied.message },
                },
              ],
              rawInput: asJsonObject(input),
            },
            options,
          } satisfies Protocol.RequestPermissionParams,
          signal: toolUseContext.abortController.signal,
          timeoutMs,
        })

      const outcome = response?.outcome
      if (!outcome || outcome.outcome === 'cancelled') {
        toolUseContext.abortController.abort()
        return {
          result: false as const,
          message: denied.message,
          shouldPromptUser: false,
        }
      }

      if (outcome.outcome === 'selected' && outcome.optionId === 'allow_once') {
        captureFileSnapshotForTool({
          session,
          toolUseId,
          toolName: tool.name,
          input,
        })
        return { result: true as const }
      }

      if (
        outcome.outcome === 'selected' &&
        outcome.optionId === 'allow_always'
      ) {
        const suggestions = denied.suggestions ?? []
        if (suggestions.length > 0) {
          const next = applyToolPermissionContextUpdates(
            session.toolPermissionContext,
            suggestions,
          )
          session.toolPermissionContext = next
          if (toolUseContext.options)
            toolUseContext.options.toolPermissionContext = next

          for (const update of suggestions) {
            try {
              persistToolPermissionUpdateToDisk({
                update,
                projectDir: session.cwd,
              })
            } catch (e) {
              logError(e)
            }
          }
        }

        captureFileSnapshotForTool({
          session,
          toolUseId,
          toolName: tool.name,
          input,
        })
        return { result: true as const }
      }

      sendToolCallUpdate(peer, session.sessionId, {
        toolCallId: toolUseId,
        status: 'failed',
      })
      return { result: false as const, message: denied.message }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      sendToolCallUpdate(peer, session.sessionId, {
        toolCallId: toolUseId,
        status: 'failed',
      })
      return {
        result: false as const,
        message: `Permission prompt failed: ${msg}`,
        shouldPromptUser: false,
      }
    }
  }
}
