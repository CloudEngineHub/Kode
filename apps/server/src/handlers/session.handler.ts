import type { Session } from '@kode/protocol'

import { loadKodeAgentSessionMessages } from '#protocol/utils/kodeAgentSessionLoad'
import { listKodeAgentSessions } from '#protocol/utils/kodeAgentSessionResume'
import type { Message } from '#protocol/utils/kodeAgentSessionLoad'

type WsLike = { send: (data: string) => void }

export function loadSessionMessages(args: {
  cwd: string
  sessionId: string
}): Message[] {
  return loadKodeAgentSessionMessages(args)
}

export function buildSessionList(args: { cwd: string }): Session[] {
  return listKodeAgentSessions({ cwd: args.cwd }).map(s => ({
    sessionId: s.sessionId,
    slug: s.slug,
    customTitle: s.customTitle,
    tag: s.tag,
    summary: s.summary,
    cwd: s.cwd,
    createdAt: s.createdAt ? s.createdAt.toISOString() : null,
    modifiedAt: s.modifiedAt ? s.modifiedAt.toISOString() : null,
  }))
}

export function sendSessionList(
  ws: WsLike,
  args: { cwd: string; onError?: (message: string) => void },
): void {
  try {
    const sessions = buildSessionList({ cwd: args.cwd })
    ws.send(JSON.stringify({ type: 'session_list', sessions }))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    args.onError?.(message)
  }
}
