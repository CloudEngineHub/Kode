import React from 'react'

import type { HttpClient } from '@kode/client'
import type {
  AgentEvent,
  PermissionRequestEvent,
  Session,
} from '@kode/protocol'

function isPermissionRequest(
  event: AgentEvent,
): event is PermissionRequestEvent {
  return event.type === 'permission_request'
}

export function useChat(args: {
  client: HttpClient | null
  resetKey: string
  onNewSession: () => void
}): {
  sessions: Session[]
  selectedSessionId: string | null
  events: AgentEvent[]
  permissionRequest: PermissionRequestEvent | null
  input: string
  setInput: (v: string) => void
  sending: boolean
  send: () => Promise<void>
  startNewSession: () => void
  selectSession: (id: string) => Promise<void>
  clearPermissionRequest: () => void
} {
  const [sessions, setSessions] = React.useState<Session[]>([])
  const [selectedSessionId, setSelectedSessionId] = React.useState<
    string | null
  >(null)
  const [events, setEvents] = React.useState<AgentEvent[]>([])
  const [permissionRequest, setPermissionRequest] =
    React.useState<PermissionRequestEvent | null>(null)
  const [input, setInput] = React.useState('')
  const [sending, setSending] = React.useState(false)

  const refreshSessions = React.useCallback(async () => {
    if (!args.client) return
    try {
      const next = await args.client.listSessions()
      setSessions(next)
    } catch {
      // ignore
    }
  }, [args.client])

  React.useEffect(() => {
    setSelectedSessionId(null)
    setEvents([])
    setPermissionRequest(null)
    setInput('')
    void refreshSessions()
  }, [args.client, args.resetKey, refreshSessions])

  const startNewSession = React.useCallback(() => {
    args.onNewSession()
  }, [args.onNewSession])

  const selectSession = React.useCallback(
    async (id: string) => {
      if (!args.client) return
      setSelectedSessionId(id)
      setEvents([])
      setPermissionRequest(null)

      try {
        const loaded = await args.client.loadSession(id)
        setEvents(loaded.events ?? [])
      } catch {
        setEvents([])
      } finally {
        void refreshSessions()
      }
    },
    [args.client, refreshSessions],
  )

  const clearPermissionRequest = React.useCallback(
    () => setPermissionRequest(null),
    [],
  )

  const send = React.useCallback(async () => {
    const text = input.trim()
    if (!text || !args.client || sending) return

    setInput('')
    setSending(true)
    setPermissionRequest(null)

    try {
      for await (const ev of args.client.sendMessage(text)) {
        if (isPermissionRequest(ev)) {
          setPermissionRequest(ev)
          continue
        }
        if (ev.type === 'history_begin' || ev.type === 'history_end') continue
        setEvents(prev => [...prev, ev])
      }
    } finally {
      setSending(false)
      void refreshSessions()
    }
  }, [args.client, input, refreshSessions, sending])

  return {
    sessions,
    selectedSessionId,
    events,
    permissionRequest,
    input,
    setInput,
    sending,
    send,
    startNewSession,
    selectSession,
    clearPermissionRequest,
  }
}
