import React from 'react'

import type { KodeClient } from '@kode/client'
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
  const inputRef = React.useRef('')
  const pastedTextCounterRef = React.useRef(1)
  const pastedTextSegmentsRef = React.useRef<WebPastedTextSegment[]>([])
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
      } catch (error) {
        setEvents([createErrorLogEvent(error)])
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

    inputRef.current = ''
    pastedTextSegmentsRef.current = []
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
    } catch (error) {
      enqueueEvent(createErrorLogEvent(error))
    } finally {
      flushBufferedEvents()
      setSending(false)
      void refreshSessions()
    }
  }, [args.client, enqueueEvent, flushBufferedEvents, refreshSessions, sending])

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
    startNewSession,
    selectSession,
    clearPermissionRequest,
  }
}

export const __useChatForTests = {
  createErrorLogEvent,
}
