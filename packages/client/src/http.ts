import type { AgentEvent, Session } from '@kode/protocol'
import { AgentEventSchema } from '@kode/protocol'

import type {
  KodeClient,
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

export class HttpClient implements KodeClient {
  private ws: WebSocketLike | null = null
  private sessionId: string | null = null
  private readonly listeners = new Set<(msg: unknown) => void>()
  private readonly connectionListeners = new Set<ConnectionListener>()

  constructor(
    private readonly options: {
      baseUrl: string
      token: string
      workspaceId?: string
      webSocketImpl?: new (url: string) => WebSocketLike
      fetchImpl?: FetchLike
    },
  ) {}

  isConnected(): boolean {
    return this.ws?.readyState === 1
  }

  disconnect(): void {
    try {
      this.ws?.close()
    } catch {}
    this.ws = null
    this.sessionId = null
    this.listeners.clear()
    this.emitConnectionChange(false)
  }

  private emit(msg: unknown): void {
    for (const listener of this.listeners) {
      try {
        listener(msg)
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

  private onMessage(listener: (msg: unknown) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
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
      if (this.ws === ws) this.ws = null
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

  private async ensureConnected(): Promise<void> {
    if (this.ws?.readyState === 1) return

    const baseUrl = resolveBaseUrl(this.options.baseUrl)
    const wsUrl = toWebSocketUrl({
      baseUrl,
      token: this.options.token,
      workspaceId: this.options.workspaceId,
      sessionId: this.sessionId ?? undefined,
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
      const onOpen = () => {
        cleanup()
        this.emitConnectionChange(true)
        resolve()
      }
      const onError = () => {
        cleanup()
        reject(new Error('WebSocket connection error'))
      }

      const cleanup = () => {
        try {
          ws.removeEventListener?.('open', onOpen)
          ws.removeEventListener?.('error', onError)
        } catch {}
      }

      ws.addEventListener('open', onOpen, { once: true })
      ws.addEventListener('error', onError, { once: true })
    })

    ws.addEventListener('message', ev => {
      const raw = (ev as IncomingMessageEvent).data
      const text = typeof raw === 'string' ? raw : String(raw ?? '')
      const parsed = safeJsonParse(text)

      const validated = AgentEventSchema.safeParse(parsed)
      if (validated.success) {
        const msg = validated.data
        if (msg.type === 'system' && msg.subtype === 'init') {
          this.sessionId = msg.session_id ?? null
        }
      }

      this.emit(parsed)
    })

    ws.addEventListener('close', () => {
      this.ws = null
      this.emitConnectionChange(false)
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
    await this.ensureConnected()
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

    const unsubscribe = this.onMessage(msg => {
      const validated = AgentEventSchema.safeParse(msg)
      if (!validated.success) return

      const event = validated.data
      queue.push(event)

      if (event.type === 'result') {
        done = true
      }

      wake()
    })

    const failStream = (message: string) => {
      if (done) return
      streamError = new Error(message)
      done = true
      wake()
    }
    const unwatchFailure = this.watchSocketFailure({
      ws,
      onClose: () =>
        failStream('WebSocket connection closed before the response completed'),
      onError: () =>
        failStream('WebSocket connection error before the response completed'),
    })

    try {
      this.send({ type: 'prompt', prompt: message })

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
  }
}
