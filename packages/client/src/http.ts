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

type SessionListMessage = { type: 'session_list'; sessions: Session[] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isSessionListMessage(value: unknown): value is SessionListMessage {
  if (!isRecord(value)) return false
  if (value.type !== 'session_list') return false
  return Array.isArray(value.sessions)
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
}): URL {
  const wsUrl = new URL(args.baseUrl.toString())
  wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:'
  wsUrl.pathname = '/ws'
  wsUrl.searchParams.set('token', args.token)
  if (args.workspaceId) wsUrl.searchParams.set('workspace', args.workspaceId)
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

  constructor(
    private readonly options: {
      baseUrl: string
      token: string
      workspaceId?: string
      webSocketImpl?: new (url: string) => WebSocketLike
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
  }

  private emit(msg: unknown): void {
    for (const listener of this.listeners) {
      try {
        listener(msg)
      } catch {}
    }
  }

  private onMessage(listener: (msg: unknown) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private async ensureConnected(): Promise<void> {
    if (this.ws?.readyState === 1) return

    const baseUrl = resolveBaseUrl(this.options.baseUrl)
    const wsUrl = toWebSocketUrl({
      baseUrl,
      token: this.options.token,
      workspaceId: this.options.workspaceId,
    })

    const WebSocketImpl =
      this.options.webSocketImpl ??
      ((globalThis as unknown as { WebSocket?: unknown }).WebSocket as
        | (new (url: string) => WebSocketLike)
        | undefined)
    if (!WebSocketImpl) {
      throw new Error('WebSocket implementation not found')
    }
    const ws = new WebSocketImpl(wsUrl.toString())
    this.ws = ws

    await new Promise<void>((resolve, reject) => {
      const onOpen = () => {
        cleanup()
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
      this.sessionId = null
    })
  }

  private send(payload: unknown): void {
    if (!this.ws || this.ws.readyState !== 1) {
      throw new Error('HttpClient is not connected')
    }
    this.ws.send(JSON.stringify(payload))
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
    await this.ensureConnected()

    return await new Promise<Session[]>((resolve, reject) => {
      const unsubscribe = this.onMessage(msg => {
        if (!isSessionListMessage(msg)) return
        unsubscribe()
        resolve(msg.sessions)
      })

      try {
        this.send({ type: 'list_sessions' })
      } catch (error) {
        unsubscribe()
        reject(error)
      }
    })
  }

  async loadSession(sessionId: string): Promise<Session> {
    await this.ensureConnected()

    const baseSession = (await this.listSessions()).find(
      s => s.sessionId === sessionId,
    ) ?? {
      sessionId,
      slug: null,
      customTitle: null,
      tag: null,
      summary: null,
      cwd: null,
      createdAt: null,
      modifiedAt: null,
    }

    const events: AgentEvent[] = []

    await new Promise<void>((resolve, reject) => {
      let capturing = false

      const unsubscribe = this.onMessage(msg => {
        if (isRecord(msg) && msg.type === 'history_begin') {
          const sid = typeof msg.sessionId === 'string' ? msg.sessionId : ''
          if (sid === sessionId) capturing = true
          return
        }

        if (isRecord(msg) && msg.type === 'history_end') {
          const sid = typeof msg.sessionId === 'string' ? msg.sessionId : ''
          if (sid === sessionId) {
            capturing = false
            unsubscribe()
            resolve()
          }
          return
        }

        if (!capturing) return

        const validated = AgentEventSchema.safeParse(msg)
        if (validated.success) events.push(validated.data)
      })

      try {
        this.send({ type: 'resume', session_id: sessionId })
      } catch (error) {
        unsubscribe()
        reject(error)
      }
    })

    return { ...baseSession, events }
  }

  async deleteSession(_sessionId: string): Promise<void> {
    throw new Error('deleteSession is not supported by the daemon yet')
  }

  async *sendMessage(message: string): AsyncGenerator<AgentEvent> {
    await this.ensureConnected()

    const queue: AgentEvent[] = []
    let resolveNext: (() => void) | null = null
    let done = false

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

    try {
      this.send({ type: 'prompt', prompt: message })

      while (!done || queue.length > 0) {
        if (queue.length === 0) {
          await new Promise<void>(resolve => {
            resolveNext = resolve
          })
          continue
        }

        const next = queue.shift()
        if (next) yield next
      }
    } finally {
      unsubscribe()
    }
  }
}
