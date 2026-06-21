import type { Tool } from '@kode/core/tooling/Tool'

import { handleChatPrompt } from '../handlers/chat.handler'
import { sendSessionList } from '../handlers/session.handler'
import { log } from '../ws/events'
import type { DaemonSession } from '../ws/types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function sendJson(
  ws: { send: (data: string) => void },
  payload: unknown,
): void {
  ws.send(JSON.stringify(payload))
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
  const ws = session.ws
  if (!ws) {
    return Response.json(
      { ok: false, error: 'No active websocket connection for this session' },
      { status: 409 },
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
      sendJson(ws, payload)
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
      })
    } catch (err) {
      wsSend(log('error', err instanceof Error ? err.message : String(err)))
    } finally {
      try {
        sendSessionList(ws, {
          cwd: session.cwd,
          onError: message => wsSend(log('error', message)),
        })
      } catch {}
    }
  })()

  return Response.json({ ok: true })
}
