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

const EVENT_FLUSH_DELAY_MS = 50

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
  const eventBufferRef = React.useRef<AgentEvent[]>([])
  const eventFlushTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )

  const appendBufferedEvents = React.useCallback(() => {
    const buffered = eventBufferRef.current
    if (buffered.length === 0) return
    eventBufferRef.current = []
    setEvents(prev => [...prev, ...buffered])
  }, [])

  const clearEventFlushTimer = React.useCallback(() => {
    if (!eventFlushTimerRef.current) return
    clearTimeout(eventFlushTimerRef.current)
    eventFlushTimerRef.current = null
  }, [])

  const flushBufferedEvents = React.useCallback(() => {
    clearEventFlushTimer()
    appendBufferedEvents()
  }, [appendBufferedEvents, clearEventFlushTimer])

  const clearBufferedEvents = React.useCallback(() => {
    clearEventFlushTimer()
    eventBufferRef.current = []
  }, [clearEventFlushTimer])

  const scheduleEventFlush = React.useCallback(() => {
    if (eventFlushTimerRef.current) return
    eventFlushTimerRef.current = setTimeout(() => {
      eventFlushTimerRef.current = null
      appendBufferedEvents()
    }, EVENT_FLUSH_DELAY_MS)
  }, [appendBufferedEvents])

  const enqueueEvent = React.useCallback(
    (event: AgentEvent) => {
      eventBufferRef.current.push(event)
      scheduleEventFlush()
    },
    [scheduleEventFlush],
  )

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
    clearBufferedEvents()
    setSelectedSessionId(null)
    setEvents([])
    setPermissionRequest(null)
    setInput('')
    void refreshSessions()
  }, [args.client, args.resetKey, clearBufferedEvents, refreshSessions])

  React.useEffect(() => {
    return () => {
      clearBufferedEvents()
    }
  }, [clearBufferedEvents])

  const startNewSession = React.useCallback(() => {
    args.onNewSession()
  }, [args.onNewSession])

  const selectSession = React.useCallback(
    async (id: string) => {
      if (!args.client) return
      clearBufferedEvents()
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
    [args.client, clearBufferedEvents, refreshSessions],
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
        enqueueEvent(ev)
      }
    } finally {
      flushBufferedEvents()
      setSending(false)
      void refreshSessions()
    }
  }, [
    args.client,
    enqueueEvent,
    flushBufferedEvents,
    input,
    refreshSessions,
    sending,
  ])

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
