import type { Tool } from '@kode/core/tooling/Tool'
import type { WrappedClient } from '@kode/core/mcp/client'

import { handleChatPrompt } from '../handlers/chat.handler'
import { sendSessionList } from '../handlers/session.handler'
import { log } from '../ws/events'
import type { DaemonSession } from '../ws/types'
import { broadcastSessionJson } from '../ws/sessionBroadcaster'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export async function routeChat(
  req: Request,
  ctx: {
    sessions: Map<string, DaemonSession>
    echo: boolean
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
  if (!prompt.trim()) {
    return Response.json(
      { ok: false, error: 'Missing prompt' },
      { status: 400 },
    )
  }

  const session = ctx.sessions.get(sessionId)
  if (!session) {
    return Response.json(
      { ok: false, error: 'Unknown session' },
      { status: 404 },
    )
  }

  if (session.activeAbortController) {
    return Response.json(
      { ok: false, error: 'Session already has an active prompt' },
      { status: 409 },
    )
  }

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
        commands: ctx.commands,
        tools: ctx.tools,
        toolNames: ctx.toolNames,
        slashCommands: ctx.slashCommands,
        mcpClients: ctx.mcpClients,
      })
    } catch (err) {
      wsSend(log('error', err instanceof Error ? err.message : String(err)))
    } finally {
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
