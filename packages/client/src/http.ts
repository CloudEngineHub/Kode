import type { AgentEvent, Session } from '@kode/protocol'
import { AgentEventSchema } from '@kode/protocol'

import type {
  RuntimeStatus,
  SessionAwareKodeClient,
  ToolPermissionDecision,
  ToolPermissionInputUpdate,
} from './types'

type WebSocketLike = {
  readonly readyState: number
  send: (data: string) => void
  close: () => void
  addEventListener: (
    type: 'open' | 'message' | 'close' | 'error',
    listener: (ev: Event) => void,
    options?: AddEventListenerOptions,
  ) => void
  removeEventListener?: (
    type: 'open' | 'message' | 'close' | 'error',
    listener: (ev: Event) => void,
    options?: EventListenerOptions,
  ) => void
}

type IncomingMessageEvent = Event & { data?: unknown }
type FetchLike = (
  input: string | URL,
  init?: {
    headers?: Record<string, string>
  },
) => Promise<Response>

type ConnectionListener = (connected: boolean) => void

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isSession(value: unknown): value is Session {
  if (!isRecord(value)) return false
  return typeof value.sessionId === 'string'
}

function isSessionListResponse(
  value: unknown,
): value is { sessions: Session[] } {
  if (!isRecord(value)) return false
  return Array.isArray(value.sessions) && value.sessions.every(isSession)
}

function isRuntimeStatus(value: unknown): value is RuntimeStatus {
  if (!isRecord(value)) return false
  const transport = value.transport
  return (
    typeof value.ok === 'boolean' &&
    (transport === 'direct' || transport === 'daemon') &&
    (typeof value.pid === 'number' || value.pid === null) &&
    (typeof value.version === 'string' || value.version === null) &&
    (typeof value.activeSessions === 'number' || value.activeSessions === null)
  )
}

function resolveBaseUrl(baseUrl: string): URL {
  if (typeof window !== 'undefined' && window.location) {
    return new URL(baseUrl, window.location.href)
  }
  return new URL(baseUrl)
}

function toWebSocketUrl(args: {
  baseUrl: URL
  token: string
  workspaceId?: string
  sessionId?: string
}): URL {
  const wsUrl = new URL(args.baseUrl.toString())
  wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:'
  wsUrl.pathname = '/ws'
  wsUrl.searchParams.set('token', args.token)
  if (args.workspaceId) wsUrl.searchParams.set('workspace', args.workspaceId)
  if (args.sessionId) wsUrl.searchParams.set('session_id', args.sessionId)
  return wsUrl
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export class HttpClient implements SessionAwareKodeClient {
  private ws: WebSocketLike | null = null
  private desiredSessionId: string | null = null
  private attachedSessionId: string | null = null
  private connectPromise: Promise<void> | null = null
  private connectionEpoch = 0
  private sendInFlight = false
  private cancelRequested = false
  private promptSent = false
  private cancelPendingSend: (() => void) | null = null
  private readonly eventListeners = new Set<(event: AgentEvent) => void>()
  private readonly connectionListeners = new Set<ConnectionListener>()

  constructor(
    private readonly options: {
      baseUrl: string
      token: string
      workspaceId?: string
      webSocketImpl?: new (url: string) => WebSocketLike
      fetchImpl?: FetchLike
      connectTimeoutMs?: number
      historySyncTimeoutMs?: number
    },
  ) {}

  isConnected(): boolean {
    return this.ws?.readyState === 1
  }

  disconnect(): void {
    this.closeCurrentSocket()
    this.desiredSessionId = null
    this.attachedSessionId = null
  }

  getAttachedSessionId(): string | null {
    return this.attachedSessionId
  }

  subscribeEvents(listener: (event: AgentEvent) => void): () => void {
    this.eventListeners.add(listener)
    return () => {
      this.eventListeners.delete(listener)
    }
  }

  async attachSession(sessionId: string): Promise<void> {
    const requestedSessionId = sessionId.trim()
    if (!requestedSessionId) {
      throw new Error('Session id is required')
    }

    if (this.desiredSessionId !== requestedSessionId) {
      this.closeCurrentSocket()
      this.desiredSessionId = requestedSessionId
      this.attachedSessionId = null
    }

    await this.ensureConnected()

    if (this.attachedSessionId !== requestedSessionId) {
      const attached = this.attachedSessionId
      this.closeCurrentSocket()
      this.attachedSessionId = null
      throw new Error(
        `Server attached unexpected session (${attached ?? 'missing'}; expected ${requestedSessionId})`,
      )
    }
  }

  async startSession(): Promise<string> {
    this.closeCurrentSocket()
    this.desiredSessionId = null
    this.attachedSessionId = null

    await this.ensureConnected()

    if (!this.attachedSessionId) {
      throw new Error('Server did not initialize a session')
    }
    return this.attachedSessionId
  }

  private emitEvent(event: AgentEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event)
      } catch {}
    }
  }

  private emitConnectionChange(connected: boolean): void {
    for (const listener of this.connectionListeners) {
      try {
        listener(connected)
      } catch {}
    }
  }

  onConnectionChange(listener: ConnectionListener): () => void {
    this.connectionListeners.add(listener)
    return () => {
      this.connectionListeners.delete(listener)
    }
  }

  private watchSocketFailure(args: {
    ws: WebSocketLike | null
    onClose: () => void
    onError: () => void
  }): () => void {
    const ws = args.ws
    if (!ws) return () => {}

    const onClose = () => {
      args.onClose()
    }
    const onError = () => {
      args.onError()
    }

    ws.addEventListener('close', onClose)
    ws.addEventListener('error', onError)

    return () => {
      try {
        ws.removeEventListener?.('close', onClose)
        ws.removeEventListener?.('error', onError)
      } catch {}
    }
  }

  private closeCurrentSocket(): void {
    const socket = this.ws
    const wasConnected = socket?.readyState === 1

    this.connectionEpoch += 1
    this.connectPromise = null
    this.ws = null

    try {
      socket?.close()
    } catch {}

    if (wasConnected) this.emitConnectionChange(false)
  }

  private async ensureConnected(): Promise<void> {
    if (
      this.ws?.readyState === 1 &&
      this.attachedSessionId &&
      this.attachedSessionId === this.desiredSessionId
    ) {
      return
    }
    if (this.connectPromise) return await this.connectPromise

    const epoch = ++this.connectionEpoch
    const desiredSessionId = this.desiredSessionId
    const promise = this.openSocket({ epoch, desiredSessionId })
    this.connectPromise = promise

    const clearConnectPromise = () => {
      if (this.connectionEpoch === epoch && this.connectPromise === promise) {
        this.connectPromise = null
      }
    }
    void promise.then(clearConnectPromise, clearConnectPromise)

    return await promise
  }

  private async openSocket(args: {
    epoch: number
    desiredSessionId: string | null
  }): Promise<void> {
    const baseUrl = resolveBaseUrl(this.options.baseUrl)
    const wsUrl = toWebSocketUrl({
      baseUrl,
      token: this.options.token,
      workspaceId: this.options.workspaceId,
      sessionId: args.desiredSessionId ?? undefined,
    })

    const WebSocketImpl =
      this.options.webSocketImpl ??
      ((globalThis as unknown as { WebSocket?: unknown }).WebSocket as
        (new (url: string) => WebSocketLike) | undefined)
    if (!WebSocketImpl) {
      throw new Error('WebSocket implementation not found')
    }
    const ws = new WebSocketImpl(wsUrl.toString())
    this.ws = ws

    await new Promise<void>((resolve, reject) => {
      let opened = false
      let initialized = false
      let historyComplete = args.desiredSessionId === null
      let settled = false
      let connectTimeout: ReturnType<typeof setTimeout> | null = null
      let historySyncTimeout: ReturnType<typeof setTimeout> | null = null

      const isCurrentSocket = () =>
        this.connectionEpoch === args.epoch && this.ws === ws

      const cleanupHandshake = () => {
        if (connectTimeout) clearTimeout(connectTimeout)
        if (historySyncTimeout) clearTimeout(historySyncTimeout)
        try {
          ws.removeEventListener?.('open', onOpen)
        } catch {}
      }

      const completeIfReady = () => {
        if (settled || !opened || !initialized) return
        if (connectTimeout) {
          clearTimeout(connectTimeout)
          connectTimeout = null
        }
        if (!historyComplete) {
          historySyncTimeout ??= setTimeout(() => {
            fail(new Error('WebSocket history synchronization timeout'))
          }, this.options.historySyncTimeoutMs ?? 60_000)
          return
        }
        settled = true
        cleanupHandshake()
        resolve()
      }

      const fail = (error: Error) => {
        if (settled) return
        settled = true
        cleanupHandshake()
        if (isCurrentSocket()) {
          this.ws = null
          this.emitConnectionChange(false)
        }
        try {
          ws.close()
        } catch {}
        reject(error)
      }

      const onMessage = (ev: Event) => {
        if (!isCurrentSocket()) return

        const raw = (ev as IncomingMessageEvent).data
        const text = typeof raw === 'string' ? raw : String(raw ?? '')
        const parsed = safeJsonParse(text)
        const validated = AgentEventSchema.safeParse(parsed)
        if (!validated.success) return

        const event = validated.data
        if (event.type === 'system' && event.subtype === 'init') {
          const announcedSessionId = event.session_id?.trim() ?? ''
          if (!announcedSessionId) {
            fail(new Error('Session init event is missing session_id'))
            return
          }

          if (
            args.desiredSessionId !== null &&
            announcedSessionId !== args.desiredSessionId
          ) {
            fail(
              new Error(
                `Server attached unexpected session (${announcedSessionId}; expected ${args.desiredSessionId})`,
              ),
            )
            return
          }

          this.attachedSessionId = announcedSessionId
          if (args.desiredSessionId === null) {
            this.desiredSessionId = announcedSessionId
          }
          initialized = true
        }
        if (
          event.type === 'history_end' &&
          args.desiredSessionId !== null &&
          event.sessionId === args.desiredSessionId
        ) {
          historyComplete = true
        }

        this.emitEvent(event)
        completeIfReady()
      }

      const onOpen = () => {
        if (!isCurrentSocket()) {
          fail(new Error('WebSocket connection attempt was superseded'))
          return
        }
        opened = true
        this.emitConnectionChange(true)
        completeIfReady()
      }
      const onError = () => {
        fail(new Error('WebSocket connection error'))
      }
      const onClose = () => {
        if (isCurrentSocket()) {
          this.ws = null
          this.emitConnectionChange(false)
        }
        if (!settled) {
          fail(
            new Error(
              'WebSocket connection closed before session synchronization completed',
            ),
          )
        }
      }

      // Register message handling before `open` so an immediate init event
      // cannot be lost between the open callback and an awaited continuation.
      ws.addEventListener('message', onMessage)
      ws.addEventListener('open', onOpen, { once: true })
      ws.addEventListener('error', onError)
      ws.addEventListener('close', onClose)

      connectTimeout = setTimeout(() => {
        fail(new Error('WebSocket connect timeout'))
      }, this.options.connectTimeoutMs ?? 5_000)
    })
  }

  private send(payload: unknown): void {
    if (!this.ws || this.ws.readyState !== 1) {
      throw new Error('HttpClient is not connected')
    }
    this.ws.send(JSON.stringify(payload))
  }

  private getFetchImpl(): FetchLike {
    const fetchImpl =
      this.options.fetchImpl ??
      ((globalThis as unknown as { fetch?: unknown }).fetch as
        FetchLike | undefined)
    if (!fetchImpl) {
      throw new Error('Fetch implementation not found')
    }
    return fetchImpl
  }

  private toApiUrl(pathname: string): URL {
    const url = resolveBaseUrl(this.options.baseUrl)
    url.pathname = pathname
    url.search = ''
    if (this.options.workspaceId) {
      url.searchParams.set('workspace', this.options.workspaceId)
    }
    return url
  }

  cancelRequest(): void {
    if (this.sendInFlight) {
      this.cancelRequested = true
      if (!this.promptSent) {
        this.cancelPendingSend?.()
        return
      }
    }
    if (!this.ws || this.ws.readyState !== 1) return
    this.send({ type: 'cancel' })
  }

  async approveToolUse(
    toolUseId: string,
    options?: {
      decision?: Exclude<ToolPermissionDecision, 'deny'>
      updatedInput?: ToolPermissionInputUpdate | null
    },
  ): Promise<void> {
    const decision: Exclude<ToolPermissionDecision, 'deny'> =
      options?.decision ?? 'allow_once'
    this.send({
      type: 'permission_response',
      request_id: toolUseId,
      decision,
      ...(options?.updatedInput ? { updated_input: options.updatedInput } : {}),
    })
  }

  async denyToolUse(
    toolUseId: string,
    reason?: string,
    options?: { updatedInput?: ToolPermissionInputUpdate | null },
  ): Promise<void> {
    this.send({
      type: 'permission_response',
      request_id: toolUseId,
      decision: 'deny',
      ...(options?.updatedInput ? { updated_input: options.updatedInput } : {}),
      ...(reason && reason.trim() ? { rejection_message: reason.trim() } : {}),
    })
  }

  async listSessions(): Promise<Session[]> {
    const url = this.toApiUrl('/api/sessions')
    const response = await this.getFetchImpl()(url, {
      headers: {
        authorization: `Bearer ${this.options.token}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to list sessions (${response.status})`)
    }

    const json: unknown = await response.json()
    if (!isSessionListResponse(json)) {
      throw new Error('Invalid sessions response')
    }

    return json.sessions
  }

  async getRuntimeStatus(): Promise<RuntimeStatus> {
    const url = this.toApiUrl('/api/health')
    const response = await this.getFetchImpl()(url, {
      headers: {
        authorization: `Bearer ${this.options.token}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to read runtime status (${response.status})`)
    }

    const json: unknown = await response.json()
    if (!isRuntimeStatus(json)) {
      throw new Error('Invalid runtime status response')
    }

    return json
  }

  async loadSession(sessionId: string): Promise<Session> {
    const url = this.toApiUrl(`/api/sessions/${encodeURIComponent(sessionId)}`)
    const response = await this.getFetchImpl()(url, {
      headers: {
        authorization: `Bearer ${this.options.token}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to load session (${response.status})`)
    }

    const json: unknown = await response.json()
    if (!isSession(json)) {
      throw new Error('Invalid session response')
    }

    const events = Array.isArray(json.events)
      ? json.events
          .map(event => AgentEventSchema.safeParse(event))
          .filter(result => result.success)
          .map(result => result.data)
      : undefined

    return { ...json, events }
  }

  async deleteSession(_sessionId: string): Promise<void> {
    throw new Error('deleteSession is not supported by the daemon yet')
  }

  async *sendMessage(message: string): AsyncGenerator<AgentEvent> {
    if (this.sendInFlight) {
      throw new Error('Another message is already in flight for this client')
    }
    this.sendInFlight = true
    this.cancelRequested = false
    this.promptSent = false
    let cancelPendingSend: (() => void) | null = null

    try {
      const cancelled = new Promise<'cancelled'>(resolve => {
        cancelPendingSend = () => resolve('cancelled')
        this.cancelPendingSend = cancelPendingSend
      })
      const connected = this.ensureConnected().then(() => 'connected' as const)
      const connectionOutcome = await Promise.race([connected, cancelled])
      if (connectionOutcome === 'cancelled') return
      if (this.cancelPendingSend === cancelPendingSend) {
        this.cancelPendingSend = null
      }
      if (this.cancelRequested) return
      const ws = this.ws

      const queue: AgentEvent[] = []
      let resolveNext: (() => void) | null = null
      let done = false
      let streamError: Error | null = null

      const wake = () => {
        if (!resolveNext) return
        const r = resolveNext
        resolveNext = null
        r()
      }

      const unsubscribe = this.subscribeEvents(event => {
        queue.push(event)

        if (event.type === 'result') {
          done = true
        }

        wake()
      })

      const failStream = (failureMessage: string) => {
        if (done) return
        streamError = new Error(failureMessage)
        done = true
        wake()
      }
      const unwatchFailure = this.watchSocketFailure({
        ws,
        onClose: () =>
          failStream(
            'WebSocket connection closed before the response completed',
          ),
        onError: () =>
          failStream(
            'WebSocket connection error before the response completed',
          ),
      })

      try {
        this.send({ type: 'prompt', prompt: message })
        this.promptSent = true

        while (!done || queue.length > 0) {
          if (queue.length === 0) {
            if (streamError) throw streamError
            await new Promise<void>(resolve => {
              resolveNext = resolve
            })
            continue
          }

          const next = queue.shift()
          if (next) yield next
        }
        if (streamError) throw streamError
      } finally {
        unsubscribe()
        unwatchFailure()
      }
    } finally {
      if (this.cancelPendingSend === cancelPendingSend) {
        this.cancelPendingSend = null
      }
      this.promptSent = false
      this.cancelRequested = false
      this.sendInFlight = false
    }
  }
}
