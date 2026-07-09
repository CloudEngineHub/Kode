import type { Tool } from '@kode/core/tooling/Tool'
import type { WrappedClient } from '@kode/core/mcp/client'
import { isUuid } from '@kode/core/utils/uuid'
import { makeSdkResultMessage } from '#protocol/utils/kodeAgentStreamJson'

import { handleChatPrompt } from '../handlers/chat.handler'
import { sendSessionList } from '../handlers/session.handler'
import { log } from '../ws/events'
import { broadcastSessionJson } from '../ws/sessionBroadcaster'
import type { SessionRegistry } from '../sessionRegistry'
import type { DaemonTurnGate } from '../turnGate'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export async function routeChat(
  req: Request,
  ctx: {
    sessionRegistry: SessionRegistry
    turnGate: DaemonTurnGate
    resolveCwd: () => Promise<string>
    echo: boolean
    echoDelayMs: number
    commands: unknown[]
    tools: Tool[]
    toolNames: string[]
    slashCommands: string[]
    mcpClients: WrappedClient[]
  },
): Promise<Response | undefined> {
  const url = new URL(req.url)
  if (url.pathname !== '/api/chat') return undefined

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    body = null
  }

  if (!isRecord(body)) {
    return Response.json(
      { ok: false, error: 'Invalid JSON body' },
      { status: 400 },
    )
  }

  const sessionId =
    typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
  const prompt = typeof body.prompt === 'string' ? body.prompt : ''

  if (!sessionId) {
    return Response.json(
      { ok: false, error: 'Missing sessionId' },
      { status: 400 },
    )
  }
  if (!isUuid(sessionId)) {
    return Response.json(
      { ok: false, error: 'Invalid sessionId' },
      { status: 400 },
    )
  }
  if (!prompt.trim()) {
    return Response.json(
      { ok: false, error: 'Missing prompt' },
      { status: 400 },
    )
  }

  const found = ctx.sessionRegistry.getOrLoad({
    cwd: await ctx.resolveCwd(),
    sessionId,
  })
  if (found.ok === false) {
    return Response.json(
      {
        ok: false,
        error:
          found.reason === 'cwd_mismatch'
            ? 'Session workspace mismatch'
            : 'Unknown session',
      },
      { status: found.reason === 'cwd_mismatch' ? 409 : 404 },
    )
  }
  const session = found.session

  const turnLease = ctx.turnGate.tryAcquire(session)
  if (!turnLease) {
    return Response.json(
      { ok: false, error: 'Session already has an active prompt' },
      { status: 409 },
    )
  }
  broadcastSessionJson(session, {
    type: 'turn_state',
    session_id: session.sessionId,
    state: 'running',
  })

  const wsSend = (payload: unknown) => {
    try {
      broadcastSessionJson(session, payload)
    } catch {}
  }

  void (async () => {
    try {
      await handleChatPrompt({
        wsSend,
        session,
        prompt,
        echo: ctx.echo,
        echoDelayMs: ctx.echoDelayMs,
        commands: ctx.commands,
        tools: ctx.tools,
        toolNames: ctx.toolNames,
        slashCommands: ctx.slashCommands,
        mcpClients: ctx.mcpClients,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      session.activeAbortController = null
      wsSend(
        makeSdkResultMessage({
          sessionId: session.sessionId,
          result: message,
          numTurns: 0,
          totalCostUsd: 0,
          durationMs: 0,
          durationApiMs: 0,
          isError: true,
        }),
      )
      wsSend(log('error', message))
    } finally {
      turnLease.release()
      ctx.sessionRegistry.evictIdleSessions()
      wsSend({
        type: 'turn_state',
        session_id: session.sessionId,
        state: 'idle',
      })
      for (const client of Array.from(session.clients)) {
        try {
          sendSessionList(client, {
            cwd: session.cwd,
            onError: message => wsSend(log('error', message)),
          })
        } catch {}
      }
    }
  })()

  return Response.json({ ok: true })
}
