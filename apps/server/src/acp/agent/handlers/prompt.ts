import { isAbsolute } from 'node:path'

import { runTurn } from '@kode/engine'
import type { Message } from '#core/query'
import { createAssistantMessage, createUserMessage } from '#core/utils/messages'
import { grantReadPermissionForOriginalDir } from '#core/utils/permissions/filesystem'
import { setCwd, setOriginalCwd } from '#core/utils/state'
import { logError } from '#core/utils/log'

import { JsonRpcError, type JsonRpcPeer } from '../../jsonrpc'
import type * as Protocol from '../../protocol'
import type { AcpSessionManager } from '../../sessionManager'
import { blocksToText } from '../content'
import { isRecord } from '../guards'
import { handleKodeMessage } from '../kodeMessages'
import { sendAgentMessageChunk } from '../notifications'
import { createAcpCanUseTool } from '../permissions'
import { persistAcpSessionToDisk } from '../sessionStore'
import type { SessionState } from '../types'

export async function handleSessionPrompt(args: {
  peer: JsonRpcPeer
  sessionManager: AcpSessionManager<SessionState>
  params: unknown
}): Promise<Protocol.PromptResponse> {
  const p = isRecord(args.params) ? args.params : {}

  const sessionId = typeof p.sessionId === 'string' ? p.sessionId : ''
  const blocks: Protocol.ContentBlock[] = Array.isArray(p.prompt)
    ? (p.prompt as Protocol.ContentBlock[])
    : Array.isArray(p.content)
      ? (p.content as Protocol.ContentBlock[])
      : []

  const session = args.sessionManager.get(sessionId)
  if (!session)
    throw new JsonRpcError(-32602, `Session not found: ${sessionId}`)

  if (!session.cwd || !isAbsolute(session.cwd)) {
    throw new JsonRpcError(-32602, `Invalid session cwd: ${session.cwd}`)
  }

  // This is deliberately synchronous: the lease must be visible before this
  // handler reaches its first await so concurrent JSON-RPC dispatch observes it.
  const acquired = args.sessionManager.tryAcquireTurn(sessionId)
  if (acquired.ok === false) {
    if (acquired.reason === 'session_busy') {
      throw new JsonRpcError(
        -32000,
        `Session already has an active prompt: ${sessionId}`,
        {
          kind: acquired.reason,
          retryable: true,
          sessionId,
        },
      )
    }

    throw new JsonRpcError(
      -32000,
      `Another ACP session has an active prompt: ${acquired.activeSessionId}`,
      {
        kind: acquired.reason,
        retryable: true,
        sessionId,
        activeSessionId: acquired.activeSessionId,
      },
    )
  }

  const { lease } = acquired
  let abortController: AbortController | null = null
  try {
    // Keep the legacy marker as the cancellation hook, while the manager lease
    // is the authoritative atomic concurrency guard.
    if (session.activeAbortController) {
      throw new JsonRpcError(
        -32000,
        `Session already has an active prompt: ${sessionId}`,
        {
          kind: 'session_busy',
          retryable: true,
          sessionId,
        },
      )
    }

    abortController = new AbortController()
    session.activeAbortController = abortController

    setOriginalCwd(session.cwd)
    await setCwd(session.cwd)
    if (abortController.signal.aborted) return { stopReason: 'cancelled' }
    grantReadPermissionForOriginalDir()

    const promptText = blocksToText(blocks)
    const userMsg = createUserMessage(promptText)

    const baseMessages: Message[] = [...session.messages, userMsg]
    session.messages.push(userMsg)

    if (process.env.KODE_ACP_ECHO === '1') {
      await handleKodeMessage({
        peer: args.peer,
        session,
        message: createAssistantMessage(promptText),
      })
      return {
        stopReason: abortController.signal.aborted ? 'cancelled' : 'end_turn',
      }
    }

    const canUseTool = createAcpCanUseTool({ peer: args.peer, session })

    const options = {
      commands: session.commands,
      tools: session.tools,
      verbose: false,
      safeMode: false,
      forkNumber: 0,
      messageLogName: session.sessionId,
      maxThinkingTokens: 0,
      persistSession: false,
      toolPermissionContext: session.toolPermissionContext,
      mcpClients: session.mcpClients,
      shouldAvoidPermissionPrompts: false,
    }

    let stopReason: Protocol.StopReason = 'end_turn'
    try {
      for await (const m of runTurn({
        messages: baseMessages,
        systemPrompt: session.systemPrompt,
        context: session.context,
        canUseTool,
        toolUseContext: {
          options,
          abortController,
          messageId: undefined,
          readFileTimestamps: session.readFileTimestamps,
          setToolJSX: () => {},
          agentId: 'main',
          responseState: session.responseState,
        },
      })) {
        if (abortController.signal.aborted) stopReason = 'cancelled'
        await handleKodeMessage({ peer: args.peer, session, message: m })
      }
      if (abortController.signal.aborted) stopReason = 'cancelled'
    } catch (err) {
      if (abortController.signal.aborted) {
        stopReason = 'cancelled'
      } else {
        logError(err)
        const msg = err instanceof Error ? err.message : String(err)
        sendAgentMessageChunk(args.peer, session.sessionId, msg)
        stopReason = 'end_turn'
      }
    }

    return { stopReason }
  } finally {
    try {
      if (session.activeAbortController === abortController) {
        session.activeAbortController = null
      }
      persistAcpSessionToDisk(session)
    } finally {
      lease.release()
    }
  }
}
