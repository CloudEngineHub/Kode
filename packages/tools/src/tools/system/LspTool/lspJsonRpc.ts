import type { Readable, Writable } from 'node:stream'

export type JsonRpcErrorObject = {
  code: number
  message: string
  data?: unknown
}

export class JsonRpcResponseError extends Error {
  readonly code: number
  readonly data?: unknown

  constructor(args: { code: number; message: string; data?: unknown }) {
    super(args.message)
    this.code = args.code
    this.data = args.data
  }
}

export type JsonRpcResponse = {
  jsonrpc?: string
  id: number | string | null
  result?: unknown
  error?: JsonRpcErrorObject
}

export type JsonRpcRequest = {
  jsonrpc?: string
  id: number | string
  method: string
  params?: unknown
}

export type JsonRpcNotification = {
  jsonrpc?: string
  method: string
  params?: unknown
}

type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse

type Pending = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timeout?: NodeJS.Timeout
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  if (Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function extractContentLength(headerText: string): number | null {
  const match = headerText.match(/^\s*content-length\s*:\s*(\d+)\s*$/im)
  if (!match) return null
  const n = Number.parseInt(match[1]!, 10)
  return Number.isFinite(n) && n >= 0 ? n : null
}

async function writeAll(stream: Writable, data: Buffer): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const ok = stream.write(data, err => {
      if (err) reject(err)
    })
    if (ok) {
      resolve()
      return
    }
    stream.once('drain', resolve)
  })
}

export class JsonRpcStreamConnection {
  private readonly reader: Readable
  private readonly writer: Writable
  private buffer: Buffer = Buffer.alloc(0)
  private readonly pending = new Map<number | string, Pending>()
  private readonly notificationHandlers = new Map<
    string,
    Set<(params: unknown) => void | Promise<void>>
  >()
  private readonly requestHandlers = new Map<
    string,
    (params: unknown) => unknown | Promise<unknown>
  >()
  private nextId = 1
  private closed = false
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(args: { reader: Readable; writer: Writable }) {
    this.reader = args.reader
    this.writer = args.writer

    this.reader.on('data', (chunk: Buffer) => {
      if (this.closed) return
      if (!chunk || chunk.length === 0) return
      this.buffer = Buffer.concat([this.buffer, chunk])
      this.processBuffer()
    })

    const onClose = () => this.close(new Error('JSON-RPC connection closed'))
    this.reader.once('close', onClose)
    this.reader.once('end', onClose)
    this.reader.once('error', (err: unknown) => {
      const e = err instanceof Error ? err : new Error(String(err))
      this.close(e)
    })
    this.writer.once('error', (err: unknown) => {
      const e = err instanceof Error ? err : new Error(String(err))
      this.close(e)
    })
  }

  private processBuffer(): void {
    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n')
      if (headerEnd === -1) return

      const headerText = this.buffer.slice(0, headerEnd).toString('utf8')
      const len = extractContentLength(headerText)
      if (len === null) {
        // Invalid framing; drop everything to avoid infinite loops.
        this.buffer = Buffer.alloc(0)
        return
      }

      const bodyStart = headerEnd + 4
      if (this.buffer.length < bodyStart + len) return

      const body = this.buffer.slice(bodyStart, bodyStart + len)
      this.buffer = this.buffer.slice(bodyStart + len)

      try {
        const msg = JSON.parse(body.toString('utf8')) as unknown
        this.handleMessage(msg)
      } catch {
        // Ignore malformed messages.
        continue
      }
    }
  }

  private handleMessage(msg: unknown): void {
    if (Array.isArray(msg)) {
      for (const entry of msg) this.handleMessage(entry)
      return
    }

    const record = asRecord(msg)
    if (!record) return

    const method = typeof record.method === 'string' ? record.method : null
    const id = record.id
    const hasId = typeof id === 'number' || typeof id === 'string'

    if (method) {
      if (hasId) {
        void this.handleServerRequest(method, id, record.params)
        return
      }
      void this.handleServerNotification(method, record.params)
      return
    }

    if (hasId) {
      const pending = this.pending.get(id)
      if (!pending) return
      this.pending.delete(id)
      if (pending.timeout) clearTimeout(pending.timeout)

      const error = record.error
      if (error && typeof error === 'object') {
        const errRec = asRecord(error)
        const code = typeof errRec?.code === 'number' ? errRec.code : -32000
        const message =
          typeof errRec?.message === 'string'
            ? errRec.message
            : 'LSP JSON-RPC error'
        const data = errRec?.data
        pending.reject(new JsonRpcResponseError({ code, message, data }))
        return
      }
      pending.resolve(record.result)
      return
    }
  }

  onNotification(
    method: string,
    handler: (params: unknown) => void | Promise<void>,
  ): { dispose: () => void } {
    const key = String(method ?? '').trim()
    if (!key) return { dispose: () => {} }
    const set = this.notificationHandlers.get(key) ?? new Set()
    set.add(handler)
    this.notificationHandlers.set(key, set)
    return {
      dispose: () => {
        const handlers = this.notificationHandlers.get(key)
        if (!handlers) return
        handlers.delete(handler)
        if (handlers.size === 0) this.notificationHandlers.delete(key)
      },
    }
  }

  onRequest(
    method: string,
    handler: (params: unknown) => unknown | Promise<unknown>,
  ): { dispose: () => void } {
    const key = String(method ?? '').trim()
    if (!key) return { dispose: () => {} }
    this.requestHandlers.set(key, handler)
    return {
      dispose: () => {
        const current = this.requestHandlers.get(key)
        if (current === handler) this.requestHandlers.delete(key)
      },
    }
  }

  private async handleServerNotification(
    method: string,
    params: unknown,
  ): Promise<void> {
    const handlers = this.notificationHandlers.get(method)
    if (!handlers || handlers.size === 0) return
    for (const handler of handlers) {
      try {
        await handler(params)
      } catch {
        // Ignore handler errors to avoid crashing the connection.
      }
    }
  }

  private async handleServerRequest(
    method: string,
    id: number | string,
    params: unknown,
  ): Promise<void> {
    const handler = this.requestHandlers.get(method)
    if (!handler) {
      await this.sendResponse({
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      })
      return
    }

    try {
      const result = await handler(params)
      await this.sendResponse({ jsonrpc: '2.0', id, result: result ?? null })
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err))
      await this.sendResponse({
        jsonrpc: '2.0',
        id,
        error: { code: -32603, message: e.message },
      })
    }
  }

  async sendNotification(method: string, params?: unknown): Promise<void> {
    if (this.closed) throw new Error('JSON-RPC connection is closed')
    const msg: JsonRpcNotification = { jsonrpc: '2.0', method, params }
    await this.sendRaw(msg)
  }

  async sendRequest(
    method: string,
    params?: unknown,
    options?: { timeoutMs?: number },
  ): Promise<unknown> {
    if (this.closed) throw new Error('JSON-RPC connection is closed')
    const id = this.nextId++
    const msg: JsonRpcRequest = { jsonrpc: '2.0', id, method, params }

    const timeoutMs =
      options?.timeoutMs && options.timeoutMs > 0 ? options.timeoutMs : null

    const promise = new Promise<unknown>((resolve, reject) => {
      const pending: Pending = { resolve, reject }
      if (timeoutMs) {
        pending.timeout = setTimeout(() => {
          this.pending.delete(id)
          reject(new Error(`LSP request timed out: ${method}`))
        }, timeoutMs)
      }
      this.pending.set(id, pending)
    })

    await this.sendRaw(msg)
    return await promise
  }

  private async sendResponse(msg: JsonRpcResponse): Promise<void> {
    await this.sendRaw(msg)
  }

  private async sendRaw(msg: JsonRpcMessage): Promise<void> {
    const payload = Buffer.from(JSON.stringify(msg), 'utf8')
    const header = Buffer.from(
      `Content-Length: ${payload.length}\r\n\r\n`,
      'utf8',
    )
    const frame = Buffer.concat([header, payload])

    this.writeQueue = this.writeQueue.then(() => writeAll(this.writer, frame))
    await this.writeQueue
  }

  close(reason?: Error): void {
    if (this.closed) return
    this.closed = true

    const err = reason ?? new Error('JSON-RPC connection closed')
    for (const [id, pending] of this.pending) {
      this.pending.delete(id)
      if (pending.timeout) clearTimeout(pending.timeout)
      pending.reject(err)
    }
  }
}
