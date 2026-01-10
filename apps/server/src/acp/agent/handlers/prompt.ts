import { isAbsolute } from 'node:path'

import {
  buildSystemPromptForSession,
  getSessionContext,
  runTurn,
} from '#core/engine'
import type { Message } from '#core/query'
import { createAssistantMessage, createUserMessage } from '#core/utils/messages'
import { grantReadPermissionForOriginalDir } from '#core/utils/permissions/filesystem'
import { setCwd, setOriginalCwd } from '#core/utils/state'
import { logError } from '#core/utils/log'

import { JsonRpcError, type JsonRpcPeer } from '../../jsonrpc'
import type * as Protocol from '../../protocol'
import { blocksToText } from '../content'
import { isRecord } from '../guards'
import { handleKodeMessage } from '../kodeMessages'
import { sendAgentMessageChunk } from '../notifications'
import { createAcpCanUseTool } from '../permissions'
import { persistAcpSessionToDisk } from '../sessionStore'
import type { SessionState } from '../types'

export async function handleSessionPrompt(args: {
  peer: JsonRpcPeer
  sessions: Map<string, SessionState>
  params: unknown
}): Promise<Protocol.PromptResponse> {
  const p = isRecord(args.params) ? args.params : {}

  const sessionId = typeof p.sessionId === 'string' ? p.sessionId : ''
  const blocks: Protocol.ContentBlock[] = Array.isArray(p.prompt)
    ? (p.prompt as Protocol.ContentBlock[])
    : Array.isArray(p.content)
      ? (p.content as Protocol.ContentBlock[])
      : []

  const session = args.sessions.get(sessionId)
  if (!session)
    throw new JsonRpcError(-32602, `Session not found: ${sessionId}`)

  if (session.activeAbortController) {
    throw new JsonRpcError(
      -32000,
      `Session already has an active prompt: ${sessionId}`,
    )
  }

  if (!session.cwd || !isAbsolute(session.cwd)) {
    throw new JsonRpcError(-32602, `Invalid session cwd: ${session.cwd}`)
  }

  setOriginalCwd(session.cwd)
  await setCwd(session.cwd)
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
    persistAcpSessionToDisk(session)
    return { stopReason: 'end_turn' }
  }

  const abortController = new AbortController()
  session.activeAbortController = abortController

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
  } finally {
    session.activeAbortController = null
    persistAcpSessionToDisk(session)
  }

  return { stopReason }
}
