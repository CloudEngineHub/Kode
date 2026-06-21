import readline from 'node:readline'

import { JsonRpcPeer } from './jsonrpc'

type TransportOptions = {
  writeLine: (line: string) => void
}

/**
 * ACP stdio transport (newline-delimited JSON-RPC 2.0).
 *
 * Note: Messages MUST NOT contain embedded newlines; JSON.stringify preserves
 * newlines in string values as `\\n` escapes, so this framing is safe.
 */
export class StdioTransport {
  private rl: readline.Interface | null = null
  private readonly pending = new Set<Promise<void>>()

  constructor(
    private readonly peer: JsonRpcPeer,
    private readonly opts: TransportOptions,
  ) {}

  start(): void {
    if (this.rl) return

    // Ensure peer can write outbound messages.
    this.peer.setSend(this.opts.writeLine)

    // Read newline-delimited JSON from stdin.
    this.rl = readline.createInterface({
      input: process.stdin,
      crlfDelay: Infinity,
    })

    this.rl.on('line', line => {
      const trimmed = line.trim()
      if (!trimmed) return

      try {
        const payload = JSON.parse(trimmed)
        const p = this.peer.handleIncoming(payload).catch(() => {
          // Best-effort: if handling fails, the peer will attempt to send a JSON-RPC error response.
        })
        this.pending.add(p)
        void p.finally(() => this.pending.delete(p))
      } catch (err) {
        // JSON-RPC parse error (-32700). id is null by spec.
        this.opts.writeLine(
          JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: { code: -32700, message: 'Parse error' },
          }),
        )
      }
    })

    this.rl.on('close', () => {
      void (async () => {
        // Ensure in-flight requests finish sending responses before exiting.
        const pending = Array.from(this.pending)
        if (pending.length > 0) {
          await Promise.allSettled(pending)
        }
        process.exit(0)
      })()
    })
  }

  stop(): void {
    this.rl?.close()
    this.rl = null
  }
}
