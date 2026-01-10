import type { Session } from '@kode/protocol'

import { kodeMessageToSdkMessage } from '#protocol/utils/kodeAgentStreamJson'
import { isUuid } from '@kode/core/utils/uuid'

import {
  buildSessionList,
  loadSessionMessages,
} from '../handlers/session.handler'

export async function routeSession(
  req: Request,
  ctx: { cwd: string },
): Promise<Response | undefined> {
  const url = new URL(req.url)
  if (!url.pathname.startsWith('/api/sessions')) return undefined

  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const pathParts = url.pathname.split('/').filter(Boolean)
  const hasId = pathParts.length >= 3
  const requestedId = hasId ? (pathParts[2] ?? '') : ''

  if (!hasId) {
    const sessions = buildSessionList({ cwd: ctx.cwd })
    return Response.json({ sessions })
  }

  const sessionId = requestedId.trim()
  if (!sessionId || !isUuid(sessionId)) {
    return Response.json(
      { ok: false, error: 'Invalid session id' },
      { status: 400 },
    )
  }

  const sessions = buildSessionList({ cwd: ctx.cwd })
  const base: Session = sessions.find(s => s.sessionId === sessionId) ?? {
    sessionId,
    slug: null,
    customTitle: null,
    tag: null,
    summary: null,
    cwd: ctx.cwd,
    createdAt: null,
    modifiedAt: null,
  }

  const messages = loadSessionMessages({ cwd: ctx.cwd, sessionId })
  const events = messages
    .map(m => kodeMessageToSdkMessage(m, sessionId))
    .filter((e): e is NonNullable<typeof e> => Boolean(e))

  return Response.json({ ...base, events })
}
