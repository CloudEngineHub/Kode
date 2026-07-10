import type {
  AgentEvent,
  DaemonEventEnvelope,
  DaemonEventMetadata,
} from '#protocol/agentEvent'

import type {
  DaemonClient,
  DaemonSession,
  DaemonSessionJournalEntry,
  DaemonTurn,
} from './types'

/**
 * Keep enough recent events for a reconnecting daemon WebSocket client without
 * letting a long-running session retain an unbounded token stream in memory.
 */
export const DEFAULT_SESSION_EVENT_JOURNAL_LIMIT = 512
export const DEFAULT_SESSION_TURN_DEDUP_LIMIT = 512

/** Reserves a cursor-visible sequence for a targeted, non-journal event. */
export function allocateSessionSequence(session: DaemonSession): number {
  return session.nextSequence++
}

function trimCompletedSessionTurns(session: DaemonSession): void {
  let overflow =
    session.turnsByClientMessageUuid.size - DEFAULT_SESSION_TURN_DEDUP_LIMIT
  if (overflow <= 0) return
  for (const [
    clientMessageUuid,
    candidate,
  ] of session.turnsByClientMessageUuid) {
    if (overflow <= 0) break
    if (candidate.state !== 'completed') continue
    session.turnsByClientMessageUuid.delete(clientMessageUuid)
    overflow -= 1
  }
}

export function getOrCreateSessionTurn(args: {
  session: DaemonSession
  clientMessageUuid: string
}): { turn: DaemonTurn; created: boolean } {
  const existing = args.session.turnsByClientMessageUuid.get(
    args.clientMessageUuid,
  )
  if (existing) return { turn: existing, created: false }

  // A daemon restart restores messages but not the in-memory turn index. The
  // persisted user UUID is the durable idempotency key, so reconstruct a
  // completed placeholder rather than appending another user message.
  const hasPersistedUserMessage = args.session.messages.some(
    message =>
      message.type === 'user' && message.uuid === args.clientMessageUuid,
  )
  if (hasPersistedUserMessage) {
    const restoredTurn: DaemonTurn = {
      turnId: crypto.randomUUID(),
      clientMessageUuid: args.clientMessageUuid,
      state: 'completed',
      terminalEvent: null,
    }
    args.session.turnsByClientMessageUuid.set(
      args.clientMessageUuid,
      restoredTurn,
    )
    trimCompletedSessionTurns(args.session)
    return { turn: restoredTurn, created: false }
  }

  const turn: DaemonTurn = {
    turnId: crypto.randomUUID(),
    clientMessageUuid: args.clientMessageUuid,
    state: 'running',
    terminalEvent: null,
  }
  args.session.turnsByClientMessageUuid.set(args.clientMessageUuid, turn)
  return { turn, created: true }
}

export function completeSessionTurn(args: {
  session: DaemonSession
  turn: DaemonTurn
  terminalEvent?: AgentEvent | null
}): void {
  args.turn.state = 'completed'
  if (args.terminalEvent !== undefined) {
    args.turn.terminalEvent = args.terminalEvent
  }

  trimCompletedSessionTurns(args.session)
}

export function addSessionClient(
  session: DaemonSession,
  client: DaemonClient,
): void {
  session.clients.add(client)
}

export function removeSessionClient(
  session: DaemonSession,
  client: DaemonClient,
): void {
  session.clients.delete(client)
}

export function sendClientJson(client: DaemonClient, payload: unknown): void {
  client.send(JSON.stringify(payload))
}

export function broadcastSessionJson(
  session: DaemonSession,
  payload: unknown,
): void {
  const text = JSON.stringify(payload)
  for (const client of Array.from(session.clients)) {
    try {
      client.send(text)
    } catch {
      session.clients.delete(client)
    }
  }
}

function wantsCorrelatedEvents(client: DaemonClient): boolean {
  return client.data?.correlatedEvents === true
}

function sendText(
  client: DaemonClient,
  text: string,
  session: DaemonSession,
): void {
  try {
    client.send(text)
  } catch {
    session.clients.delete(client)
  }
}

function makeMetadata(args: {
  session: DaemonSession
  turn?: DaemonTurn | null
  sequence: number
  replayed: boolean
  snapshot?: boolean
}): DaemonEventMetadata {
  return {
    sessionId: args.session.sessionId,
    turnId: args.turn?.turnId ?? null,
    clientMessageUuid: args.turn?.clientMessageUuid ?? null,
    sequence: args.sequence,
    replayed: args.replayed,
    snapshot: args.snapshot === true,
  }
}

function envelope(args: {
  event: AgentEvent
  metadata: DaemonEventMetadata
}): DaemonEventEnvelope {
  return {
    type: 'daemon_event',
    event: args.event,
    metadata: args.metadata,
  }
}

function appendJournal(
  session: DaemonSession,
  entry: DaemonSessionJournalEntry,
): void {
  session.eventJournal.push(entry)
  const overflow =
    session.eventJournal.length - DEFAULT_SESSION_EVENT_JOURNAL_LIMIT
  if (overflow > 0) session.eventJournal.splice(0, overflow)
}

function sendProjectedEvent(args: {
  client: DaemonClient
  session: DaemonSession
  entry: DaemonSessionJournalEntry
}): void {
  const payload = wantsCorrelatedEvents(args.client)
    ? envelope({ event: args.entry.event, metadata: args.entry.metadata })
    : args.entry.event
  sendText(args.client, JSON.stringify(payload), args.session)
}

/**
 * The only path for daemon session events produced after Wave 0. It records a
 * raw AgentEvent once, then projects correlation metadata only to clients that
 * explicitly negotiated the daemon capability.
 */
export function publishSessionEvent(args: {
  session: DaemonSession
  event: AgentEvent
  turn?: DaemonTurn | null
  audience?: 'all' | 'correlated_only'
  journal?: boolean
}): DaemonSessionJournalEntry {
  const entry: DaemonSessionJournalEntry = {
    event: args.event,
    metadata: makeMetadata({
      session: args.session,
      turn: args.turn,
      sequence: args.session.nextSequence++,
      replayed: false,
    }),
  }
  if (args.journal !== false) appendJournal(args.session, entry)
  for (const client of Array.from(args.session.clients)) {
    if (args.audience === 'correlated_only' && !wantsCorrelatedEvents(client)) {
      continue
    }
    sendProjectedEvent({ client, session: args.session, entry })
  }
  return entry
}

/**
 * Sends a connection-local protocol/control event. It intentionally does not
 * enter the replay journal and uses sequence 0 by default so handshake
 * traffic can never advance a reconnect cursor past replayable session data.
 */
export function sendSessionEventToClient(args: {
  client: DaemonClient
  session: DaemonSession
  event: AgentEvent
  turn?: DaemonTurn | null
  replayed?: boolean
  snapshot?: boolean
  sequence?: number
}): DaemonSessionJournalEntry {
  const entry: DaemonSessionJournalEntry = {
    event: args.event,
    metadata: makeMetadata({
      session: args.session,
      turn: args.turn,
      sequence: args.sequence ?? 0,
      replayed: args.replayed === true,
      snapshot: args.snapshot === true,
    }),
  }
  sendProjectedEvent({ client: args.client, session: args.session, entry })
  return entry
}

/**
 * Replays only journal entries newer than the client cursor. Replay is an
 * opt-in transport projection; legacy clients retain their existing raw
 * history path.
 */
export function replaySessionJournalToClient(args: {
  client: DaemonClient
  session: DaemonSession
  afterSequence: number
  turn?: DaemonTurn | null
}): void {
  for (const entry of args.session.eventJournal) {
    if (entry.metadata.sequence <= args.afterSequence) continue
    const replayedEntry: DaemonSessionJournalEntry = {
      event: entry.event,
      metadata: {
        ...entry.metadata,
        replayed: true,
        snapshot: false,
      },
    }
    sendProjectedEvent({
      client: args.client,
      session: args.session,
      entry: replayedEntry,
    })
  }
}
