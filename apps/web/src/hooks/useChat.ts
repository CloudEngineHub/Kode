import React from 'react'

import type { KodeClient, SessionAwareKodeClient } from '@kode/client'
import type {
  AgentEvent,
  PermissionRequestEvent,
  Session,
} from '@kode/protocol'
import {
  expandWebPastedTextPlaceholders,
  insertWebPastedTextPlaceholder,
  retainReferencedWebPastedTextSegments,
  type WebPastedTextSegment,
} from '../lib/pastedText'

function isPermissionRequest(
  event: AgentEvent,
): event is PermissionRequestEvent {
  return event.type === 'permission_request'
}

function isSessionAwareClient(
  client: KodeClient | null,
): client is SessionAwareKodeClient {
  return Boolean(
    client &&
    'attachSession' in client &&
    typeof client.attachSession === 'function' &&
    'startSession' in client &&
    typeof client.startSession === 'function' &&
    'subscribeEvents' in client &&
    typeof client.subscribeEvents === 'function' &&
    'getAttachedSessionId' in client &&
    typeof client.getAttachedSessionId === 'function',
  )
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function createErrorLogEvent(error: unknown): AgentEvent {
  return {
    type: 'log',
    log: {
      level: 'error',
      message: getErrorMessage(error),
    },
  }
}

function getEventSessionId(event: AgentEvent): string | null {
  if (event.type === 'history_begin' || event.type === 'history_end') {
    return event.sessionId
  }
  if ('session_id' in event && typeof event.session_id === 'string') {
    return event.session_id
  }
  return null
}

function getEventIdentity(event: AgentEvent): string | null {
  if ('uuid' in event && typeof event.uuid === 'string' && event.uuid) {
    return `${event.type}:${event.uuid}`
  }
  if (event.type === 'permission_request') {
    return `${event.type}:${event.request_id}`
  }
  return null
}

function getTurnStateSending(event: AgentEvent): boolean | null {
  if (event.type !== 'turn_state') return null
  return event.state === 'running'
}

function appendUniqueEvent(
  events: AgentEvent[],
  event: AgentEvent,
): AgentEvent[] {
  const identity = getEventIdentity(event)
  if (!identity) return [...events, event]
  return events.some(candidate => getEventIdentity(candidate) === identity)
    ? events
    : [...events, event]
}

const EVENT_FLUSH_DELAY_MS = 50

export function useChat(args: {
  client: KodeClient | null
  resetKey: string
  onNewSession: () => void
}): {
  sessions: Session[]
  selectedSessionId: string | null
  events: AgentEvent[]
  permissionRequest: PermissionRequestEvent | null
  input: string
  setInput: (v: string) => void
  insertPastedText: (args: {
    text: string
    selectionStart: number | null
    selectionEnd: number | null
  }) => { cursorOffset: number } | null
  sending: boolean
  send: () => Promise<void>
  cancel: () => void
  startNewSession: () => void
  selectSession: (id: string) => Promise<void>
  clearPermissionRequest: () => void
} {
  const onNewSession = args.onNewSession
  const sessionClient = isSessionAwareClient(args.client) ? args.client : null
  const [sessions, setSessions] = React.useState<Session[]>([])
  const [selectedSessionId, setSelectedSessionId] = React.useState<
    string | null
  >(null)
  const [events, setEvents] = React.useState<AgentEvent[]>([])
  const [permissionRequest, setPermissionRequest] =
    React.useState<PermissionRequestEvent | null>(null)
  const [input, setInput] = React.useState('')
  const [sending, setSending] = React.useState(false)
  const inputRef = React.useRef('')
  const pastedTextCounterRef = React.useRef(1)
  const pastedTextSegmentsRef = React.useRef<WebPastedTextSegment[]>([])
  const eventBufferRef = React.useRef<AgentEvent[]>([])
  const historyBufferRef = React.useRef<AgentEvent[] | null>(null)
  const selectedSessionIdRef = React.useRef<string | null>(null)
  const selectionEpochRef = React.useRef(0)
  const sessionRefreshEpochRef = React.useRef(0)
  const eventFlushTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )

  const appendBufferedEvents = React.useCallback(() => {
    const buffered = eventBufferRef.current
    if (buffered.length === 0) return
    eventBufferRef.current = []
    setEvents(prev =>
      buffered.reduce((next, event) => appendUniqueEvent(next, event), prev),
    )
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
    historyBufferRef.current = null
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
    const client = args.client
    const refreshEpoch = ++sessionRefreshEpochRef.current
    if (!client) {
      setSessions([])
      return
    }
    try {
      const next = await client.listSessions()
      if (sessionRefreshEpochRef.current === refreshEpoch) {
        setSessions(next)
      }
    } catch {
      // ignore
    }
  }, [args.client])

  const handleEvent = React.useCallback(
    (event: AgentEvent) => {
      if (event.type === 'session_list') {
        sessionRefreshEpochRef.current += 1
        setSessions(event.sessions)
        return
      }

      if (
        event.type === 'system' &&
        event.subtype === 'init' &&
        typeof event.session_id === 'string'
      ) {
        selectedSessionIdRef.current = event.session_id
        setSelectedSessionId(event.session_id)
        return
      }

      const authoritativeSending = getTurnStateSending(event)
      if (authoritativeSending !== null && event.type === 'turn_state') {
        const selectedId =
          selectedSessionIdRef.current ??
          sessionClient?.getAttachedSessionId() ??
          null
        if (selectedId && event.session_id !== selectedId) return
        setSending(authoritativeSending)
        if (!authoritativeSending) setPermissionRequest(null)
        return
      }

      const eventSessionId = getEventSessionId(event)
      const selectedId =
        selectedSessionIdRef.current ??
        sessionClient?.getAttachedSessionId() ??
        null
      if (eventSessionId && selectedId && eventSessionId !== selectedId) return

      if (event.type === 'history_begin') {
        clearBufferedEvents()
        historyBufferRef.current = []
        setSending(false)
        setPermissionRequest(null)
        return
      }

      if (event.type === 'history_end') {
        clearEventFlushTimer()
        const history = historyBufferRef.current ?? []
        historyBufferRef.current = null
        eventBufferRef.current = []
        setEvents(
          history.reduce(
            (next, historyEvent) => appendUniqueEvent(next, historyEvent),
            [] as AgentEvent[],
          ),
        )
        return
      }

      if (isPermissionRequest(event)) {
        setPermissionRequest(event)
        setSending(true)
        return
      }

      if (event.type === 'result') {
        setSending(false)
        setPermissionRequest(null)
      } else if (event.type === 'user' && historyBufferRef.current === null) {
        setSending(true)
      }

      if (historyBufferRef.current !== null) {
        historyBufferRef.current = appendUniqueEvent(
          historyBufferRef.current,
          event,
        )
        return
      }

      enqueueEvent(event)
    },
    [clearBufferedEvents, clearEventFlushTimer, enqueueEvent, sessionClient],
  )

  React.useEffect(() => {
    if (!sessionClient) return
    return sessionClient.subscribeEvents(handleEvent)
  }, [handleEvent, sessionClient])

  React.useEffect(() => {
    clearBufferedEvents()
    sessionRefreshEpochRef.current += 1
    selectionEpochRef.current += 1
    setSessions([])
    selectedSessionIdRef.current = null
    setSelectedSessionId(null)
    setEvents([])
    setPermissionRequest(null)
    setSending(false)
    inputRef.current = ''
    pastedTextCounterRef.current = 1
    pastedTextSegmentsRef.current = []
    setInput('')
    void refreshSessions()
  }, [args.client, args.resetKey, clearBufferedEvents, refreshSessions])

  React.useEffect(() => {
    return () => {
      clearBufferedEvents()
    }
  }, [clearBufferedEvents])

  const startNewSession = React.useCallback(() => {
    if (sending) return
    if (!sessionClient) {
      onNewSession()
      return
    }

    const epoch = ++selectionEpochRef.current
    clearBufferedEvents()
    selectedSessionIdRef.current = null
    setSelectedSessionId(null)
    setEvents([])
    setPermissionRequest(null)
    setSending(false)

    void sessionClient.startSession().catch(error => {
      if (selectionEpochRef.current !== epoch) return
      setEvents([createErrorLogEvent(error)])
    })
  }, [clearBufferedEvents, onNewSession, sending, sessionClient])

  const selectSession = React.useCallback(
    async (id: string) => {
      if (!args.client || sending) return
      const epoch = ++selectionEpochRef.current
      clearBufferedEvents()
      selectedSessionIdRef.current = id
      setSelectedSessionId(id)
      setEvents([])
      setPermissionRequest(null)
      setSending(false)

      try {
        if (sessionClient) {
          await sessionClient.attachSession(id)
        } else {
          const loaded = await args.client.loadSession(id)
          if (selectionEpochRef.current === epoch) {
            setEvents(loaded.events ?? [])
          }
        }
      } catch (error) {
        if (selectionEpochRef.current === epoch) {
          clearBufferedEvents()
          setEvents([createErrorLogEvent(error)])
        }
      } finally {
        if (selectionEpochRef.current === epoch) void refreshSessions()
      }
    },
    [args.client, clearBufferedEvents, refreshSessions, sending, sessionClient],
  )

  const clearPermissionRequest = React.useCallback(
    () => setPermissionRequest(null),
    [],
  )

  const cancel = React.useCallback(() => {
    args.client?.cancelRequest()
  }, [args.client])

  const setInputValue = React.useCallback((value: string) => {
    inputRef.current = value
    pastedTextSegmentsRef.current = retainReferencedWebPastedTextSegments({
      input: value,
      pastedTexts: pastedTextSegmentsRef.current,
    })
    setInput(value)
  }, [])

  const insertPastedText = React.useCallback(
    (paste: {
      text: string
      selectionStart: number | null
      selectionEnd: number | null
    }) => {
      const result = insertWebPastedTextPlaceholder({
        input: inputRef.current,
        text: paste.text,
        id: pastedTextCounterRef.current,
        selectionStart: paste.selectionStart,
        selectionEnd: paste.selectionEnd,
      })
      pastedTextCounterRef.current += 1
      inputRef.current = result.input
      pastedTextSegmentsRef.current = [
        ...retainReferencedWebPastedTextSegments({
          input: result.input,
          pastedTexts: pastedTextSegmentsRef.current,
        }),
        result.segment,
      ]
      setInput(result.input)
      return { cursorOffset: result.cursorOffset }
    },
    [],
  )

  const send = React.useCallback(async () => {
    const text = expandWebPastedTextPlaceholders({
      input: inputRef.current,
      pastedTexts: pastedTextSegmentsRef.current,
    }).trim()
    if (!text || !args.client || sending) return

    const sendEpoch = selectionEpochRef.current
    const sendSessionId = sessionClient?.getAttachedSessionId() ?? null
    const isCurrentSelection = () =>
      selectionEpochRef.current === sendEpoch &&
      (sendSessionId === null ||
        sessionClient?.getAttachedSessionId() === sendSessionId)

    inputRef.current = ''
    pastedTextSegmentsRef.current = []
    setInput('')
    setSending(true)
    setPermissionRequest(null)

    const receivesPersistentEvents = Boolean(sessionClient)

    try {
      for await (const ev of args.client.sendMessage(text)) {
        if (!isCurrentSelection()) continue
        if (receivesPersistentEvents) continue
        if (isPermissionRequest(ev)) {
          setPermissionRequest(ev)
          continue
        }
        if (ev.type === 'history_begin' || ev.type === 'history_end') continue
        enqueueEvent(ev)
      }
    } catch (error) {
      if (isCurrentSelection()) enqueueEvent(createErrorLogEvent(error))
    } finally {
      if (isCurrentSelection()) {
        flushBufferedEvents()
        setSending(false)
        void refreshSessions()
      }
    }
  }, [
    args.client,
    enqueueEvent,
    flushBufferedEvents,
    refreshSessions,
    sending,
    sessionClient,
  ])

  return {
    sessions,
    selectedSessionId,
    events,
    permissionRequest,
    input,
    setInput: setInputValue,
    insertPastedText,
    sending,
    send,
    cancel,
    startNewSession,
    selectSession,
    clearPermissionRequest,
  }
}

export const __useChatForTests = {
  appendUniqueEvent,
  createErrorLogEvent,
  getEventSessionId,
  getTurnStateSending,
}
