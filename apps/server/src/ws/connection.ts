import type { RawData, WebSocket } from 'ws'

import {
  makeSdkInitMessage,
  kodeMessageToSdkMessage,
} from '#protocol/utils/kodeAgentStreamJson'
import { isUuid } from '@kode/core/utils/uuid'
import { loadToolPermissionContextFromDisk } from '@kode/core/utils/permissions/toolPermissionSettings'

import type { Tool } from '@kode/core/tooling/Tool'

import {
  sendSessionList,
  loadSessionMessages,
} from '../handlers/session.handler'
import { handleChatPrompt } from '../handlers/chat.handler'
import { parseClientWsMessage, sendJson, log } from './events'
import type { DaemonSession } from './types'

type WsWithSession = WebSocket & { data: { session: DaemonSession } }

export function createWebSocketHandlers(args: {
  sessions: Map<string, DaemonSession>
  toolNames: string[]
  slashCommands: string[]
  commands: unknown[]
  tools: Tool[]
  echo: boolean
}) {
  return {
    open(ws: WsWithSession) {
      const session = ws.data.session
      session.ws = ws
      sendJson(
        ws,
        makeSdkInitMessage({
          sessionId: session.sessionId,
          cwd: session.cwd,
          tools: args.toolNames,
          slashCommands: args.slashCommands,
        }),
      )
      sendSessionList(ws, {
        cwd: session.cwd,
        onError: message => sendJson(ws, log('error', message)),
      })
    },

    async message(ws: WsWithSession, message: RawData) {
      const session = ws.data.session
      const parsed = parseClientWsMessage(message)
      if (parsed.ok === false) {
        sendJson(ws, log('error', parsed.error))
        return
      }

      const payload = parsed.value

      if (payload.type === 'cancel') {
        try {
          session.activeAbortController?.abort()
        } catch {}
        for (const resolve of session.inflightPermissionRequests.values()) {
          try {
            resolve({
              decision: 'deny',
              rejectionMessage: 'Cancelled',
              updatedInput: null,
            })
          } catch {}
        }
        session.inflightPermissionRequests.clear()
        return
      }

      if (payload.type === 'permission_response') {
        const resolve = session.inflightPermissionRequests.get(
          payload.requestId,
        )
        if (!resolve) return
        session.inflightPermissionRequests.delete(payload.requestId)
        try {
          resolve({
            decision: payload.decision,
            updatedInput: payload.updatedInput,
            rejectionMessage: payload.rejectionMessage,
          })
        } catch {}
        return
      }

      if (payload.type === 'list_sessions') {
        sendSessionList(ws, {
          cwd: session.cwd,
          onError: message => sendJson(ws, log('error', message)),
        })
        return
      }

      if (payload.type === 'new_session') {
        try {
          session.activeAbortController?.abort()
        } catch {}
        for (const resolve of session.inflightPermissionRequests.values()) {
          try {
            resolve({
              decision: 'deny',
              rejectionMessage: 'Cancelled',
              updatedInput: null,
            })
          } catch {}
        }
        session.inflightPermissionRequests.clear()

        session.messages = []
        session.readFileTimestamps = {}
        session.responseState = {}
        session.activeAbortController = null

        session.toolPermissionContext = loadToolPermissionContextFromDisk({
          projectDir: session.cwd,
          includeKodeProjectConfig: true,
          isBypassPermissionsModeAvailable: true,
        })

        const nextId = crypto.randomUUID()
        args.sessions.delete(session.sessionId)
        session.sessionId = nextId
        args.sessions.set(session.sessionId, session)

        sendJson(
          ws,
          makeSdkInitMessage({
            sessionId: session.sessionId,
            cwd: session.cwd,
            tools: args.toolNames,
            slashCommands: args.slashCommands,
          }),
        )
        sendSessionList(ws, {
          cwd: session.cwd,
          onError: message => sendJson(ws, log('error', message)),
        })
        return
      }

      if (payload.type === 'resume') {
        if (!isUuid(payload.sessionId)) {
          sendJson(ws, log('error', 'Invalid session_id'))
          return
        }

        try {
          const loaded = loadSessionMessages({
            cwd: session.cwd,
            sessionId: payload.sessionId,
          })

          session.messages = loaded
          session.readFileTimestamps = {}
          session.responseState = {}
          try {
            session.activeAbortController?.abort()
          } catch {}
          session.activeAbortController = null

          args.sessions.delete(session.sessionId)
          session.sessionId = payload.sessionId
          args.sessions.set(session.sessionId, session)

          sendJson(
            ws,
            makeSdkInitMessage({
              sessionId: session.sessionId,
              cwd: session.cwd,
              tools: args.toolNames,
              slashCommands: args.slashCommands,
            }),
          )

          sendJson(ws, { type: 'history_begin', sessionId: session.sessionId })
          for (const m of loaded) {
            const sdk = kodeMessageToSdkMessage(m, session.sessionId)
            if (sdk) sendJson(ws, sdk)
          }
          sendJson(ws, { type: 'history_end', sessionId: session.sessionId })

          sendSessionList(ws, {
            cwd: session.cwd,
            onError: message => sendJson(ws, log('error', message)),
          })
        } catch (err) {
          sendJson(
            ws,
            log('error', err instanceof Error ? err.message : String(err)),
          )
        }
        return
      }

      if (payload.type === 'prompt') {
        if (session.activeAbortController) {
          sendJson(ws, log('error', 'Session already has an active prompt'))
          return
        }

        const wsSend = (outgoing: unknown) => sendJson(ws, outgoing)

        try {
          await handleChatPrompt({
            wsSend,
            session,
            prompt: payload.prompt,
            echo: args.echo,
            commands: args.commands,
            tools: args.tools,
            toolNames: args.toolNames,
            slashCommands: args.slashCommands,
          })
        } finally {
          sendSessionList(ws, {
            cwd: session.cwd,
            onError: message => sendJson(ws, log('error', message)),
          })
        }
      }
    },

    close(ws: WsWithSession) {
      const session = ws.data.session
      session.ws = null
      try {
        session.activeAbortController?.abort()
      } catch {}
      for (const resolve of session.inflightPermissionRequests.values()) {
        try {
          resolve({
            decision: 'deny',
            rejectionMessage: 'Disconnected',
            updatedInput: null,
          })
        } catch {}
      }
      session.inflightPermissionRequests.clear()
      args.sessions.delete(session.sessionId)
    },
  }
}
