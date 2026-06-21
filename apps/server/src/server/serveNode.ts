import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import type { Duplex } from 'node:stream'
import { WebSocketServer, type RawData, type WebSocket } from 'ws'

type ServeNodeFetchServer<TData> = {
  upgrade: (req: Request, options: { data: TData }) => boolean
}

export type ServeNodeOptions<TData> = {
  hostname: string
  port: number
  fetch: (
    req: Request,
    server: ServeNodeFetchServer<TData>,
  ) => Response | Promise<Response | undefined> | undefined
  websocket: {
    open: (ws: WebSocket & { data: TData }) => void
    message: (
      ws: WebSocket & { data: TData },
      message: RawData,
    ) => void | Promise<void>
    close: (ws: WebSocket & { data: TData }) => void
  }
}

export type ServeNodeResult = {
  port: number
  stop: (force?: boolean) => void
}

async function readRequestBody(
  req: IncomingMessage,
): Promise<ArrayBuffer | undefined> {
  const method = req.method ?? 'GET'
  if (method === 'GET' || method === 'HEAD') return undefined

  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  if (chunks.length === 0) return undefined
  const buf = Buffer.concat(chunks)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

async function toFetchRequest(
  req: IncomingMessage,
  hostname: string,
): Promise<Request> {
  const base = `http://${req.headers.host ?? hostname}`
  const url = new URL(req.url ?? '/', base)
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(key, value)
    else if (Array.isArray(value)) headers.set(key, value.join(', '))
  }
  const body = await readRequestBody(req)
  return new Request(url.toString(), {
    method: req.method ?? 'GET',
    headers,
    ...(body ? { body } : {}),
  })
}

async function sendFetchResponse(
  res: ServerResponse,
  response: Response,
): Promise<void> {
  res.statusCode = response.status
  for (const [key, value] of response.headers.entries()) {
    try {
      res.setHeader(key, value)
    } catch {}
  }

  if (!response.body || res.req?.method === 'HEAD') {
    res.end()
    return
  }

  const buf = Buffer.from(await response.arrayBuffer())
  res.setHeader('content-length', String(buf.length))
  res.end(buf)
}

async function sendFetchResponseToSocket(
  socket: Duplex,
  response: Response,
): Promise<void> {
  const headers: string[] = []
  for (const [key, value] of response.headers.entries()) {
    headers.push(`${key}: ${value}`)
  }
  if (!response.headers.has('connection')) headers.push('connection: close')

  const body = response.body
    ? Buffer.from(await response.arrayBuffer())
    : Buffer.alloc(0)
  headers.push(`content-length: ${body.length}`)

  const statusText = response.statusText || 'OK'
  socket.write(`HTTP/1.1 ${response.status} ${statusText}\r\n`)
  socket.write(headers.join('\r\n'))
  socket.write('\r\n\r\n')
  if (body.length) socket.write(body)
  socket.destroy()
}

export async function serveNode<TData>(
  options: ServeNodeOptions<TData>,
): Promise<ServeNodeResult> {
  const wss = new WebSocketServer({ noServer: true })

  const httpServer = createServer(async (req, res) => {
    const request = await toFetchRequest(req, options.hostname)
    const response = await options.fetch(request, { upgrade: () => false })
    if (!response) {
      res.statusCode = 500
      res.end('No response')
      return
    }
    await sendFetchResponse(res, response)
  })

  httpServer.on('upgrade', async (req, socket, head) => {
    const request = await toFetchRequest(req, options.hostname)
    let upgraded = false

    const response = await options.fetch(request, {
      upgrade: (_request, upgradeOptions) => {
        if (upgraded) return true
        upgraded = true

        try {
          wss.handleUpgrade(req, socket, head, ws => {
            const wsWithData = Object.assign(ws, { data: upgradeOptions.data })

            ws.on('message', message => {
              Promise.resolve(
                options.websocket.message(wsWithData, message),
              ).catch(() => {})
            })
            ws.on('close', () => {
              try {
                options.websocket.close(wsWithData)
              } catch {}
            })

            try {
              options.websocket.open(wsWithData)
            } catch {}
          })
          return true
        } catch {
          return false
        }
      },
    })

    if (upgraded) return
    if (response) {
      await sendFetchResponseToSocket(socket, response)
      return
    }
    socket.destroy()
  })

  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error) => {
      reject(err)
    }
    httpServer.once('error', onError)
    httpServer.listen(options.port, options.hostname, () => {
      httpServer.removeListener('error', onError)
      resolve()
    })
  })

  const address = httpServer.address()
  const actualPort =
    typeof address === 'object' && address && typeof address.port === 'number'
      ? address.port
      : options.port

  const stop = () => {
    try {
      wss.clients.forEach(ws => {
        try {
          ws.close()
        } catch {}
      })
    } catch {}
    try {
      wss.close()
    } catch {}
    try {
      httpServer.close()
    } catch {}
  }

  return { port: actualPort, stop }
}
