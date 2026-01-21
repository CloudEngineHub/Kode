import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { basename, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { JsonRpcResponseError, JsonRpcStreamConnection } from './lspJsonRpc'
import {
  buildLspServerProcessEnv,
  resolveExecutableFromEnv,
  type LspServerConfig,
} from './lspConfig'

const CONTENT_MODIFIED_ERROR_CODE = -32801
const MAX_CONTENT_MODIFIED_RETRIES = 3
const CONTENT_MODIFIED_RETRY_BASE_MS = 500
const DEFAULT_STARTUP_TIMEOUT_MS = 15_000
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 5_000

export type LspServerRunState =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'error'

type NotificationHandler = (params: unknown) => void | Promise<void>
type RequestHandler = (params: unknown) => unknown | Promise<unknown>

function asError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err))
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export class LspServer {
  readonly name: string
  readonly config: LspServerConfig
  readonly rootPath: string

  state: LspServerRunState = 'stopped'
  startTime: Date | undefined
  lastError: Error | undefined
  restartCount = 0

  private child: ChildProcessWithoutNullStreams | null = null
  private rpc: JsonRpcStreamConnection | null = null
  private isInitialized = false
  private ignoreExitForPids = new Set<number>()

  private readonly notificationHandlers = new Map<
    string,
    Set<NotificationHandler>
  >()
  private readonly requestHandlers = new Map<string, RequestHandler>()

  constructor(args: {
    name: string
    config: LspServerConfig
    rootPath: string
  }) {
    this.name = args.name
    this.config = args.config
    this.rootPath = resolve(args.rootPath)
  }

  getProcessPid(): number | null {
    return this.child?.pid ?? null
  }

  private getShutdownTimeoutMs(): number {
    return DEFAULT_SHUTDOWN_TIMEOUT_MS
  }

  onNotification(method: string, handler: NotificationHandler): void {
    const key = String(method ?? '').trim()
    if (!key) return

    const set = this.notificationHandlers.get(key) ?? new Set()
    set.add(handler)
    this.notificationHandlers.set(key, set)

    if (this.rpc) {
      this.rpc.onNotification(key, handler)
    }
  }

  onRequest(method: string, handler: RequestHandler): void {
    const key = String(method ?? '').trim()
    if (!key) return

    this.requestHandlers.set(key, handler)
    if (this.rpc) {
      this.rpc.onRequest(key, handler)
    }
  }

  private async disposeProcess(): Promise<void> {
    const rpc = this.rpc
    const child = this.child
    this.rpc = null
    this.child = null
    this.isInitialized = false

    if (!rpc || !child) {
      rpc?.close()
      try {
        child?.kill()
      } catch {
        // ignore
      }
      return
    }

    if (typeof child.pid === 'number') {
      this.ignoreExitForPids.add(child.pid)
    }

    try {
      await rpc.sendRequest(
        'shutdown',
        {},
        { timeoutMs: this.getShutdownTimeoutMs() },
      )
    } catch {
      // ignore
    }

    try {
      await rpc.sendNotification('exit', {})
    } catch {
      // ignore
    }

    rpc.close()

    try {
      child.kill()
    } catch {
      // ignore
    }
  }

  private installLifecycleHandlers(): void {
    const child = this.child
    if (!child) return

    const pid = child.pid
    child.once('exit', (code, signal) => {
      if (!pid) return
      if (this.ignoreExitForPids.has(pid)) {
        this.ignoreExitForPids.delete(pid)
        return
      }

      if (this.state === 'stopping' || this.state === 'stopped') return
      if (this.state === 'error') return

      const message = `LSP server exited (${this.name}): code=${code ?? 'null'} signal=${signal ?? 'null'}`
      const err = new Error(message)
      this.lastError = err
      this.state = 'error'
      this.rpc?.close(err)
    })

    child.once('error', err => {
      const message = `LSP server spawn error (${this.name}): ${asError(err).message}`
      const e = new Error(message)
      this.lastError = e
      this.state = 'error'
      this.rpc?.close(e)
    })
  }

  private installRpcHandlers(): void {
    const rpc = this.rpc
    if (!rpc) return

    // Minimal client-side handlers for common server requests.
    rpc.onRequest('client/registerCapability', async () => null)
    rpc.onRequest('client/unregisterCapability', async () => null)

    for (const [method, handler] of this.requestHandlers.entries()) {
      rpc.onRequest(method, handler)
    }
    for (const [method, handlers] of this.notificationHandlers.entries()) {
      for (const handler of handlers) {
        rpc.onNotification(method, handler)
      }
    }
  }

  async start(): Promise<void> {
    if (this.state === 'running' || this.state === 'starting') return

    this.state = 'starting'
    this.lastError = undefined
    this.startTime = undefined

    try {
      if (this.config.restartOnCrash !== undefined) {
        throw new Error(
          `LSP server '${this.name}': restartOnCrash is not yet implemented. Remove this field from the configuration.`,
        )
      }
      if (this.config.startupTimeout !== undefined) {
        throw new Error(
          `LSP server '${this.name}': startupTimeout is not yet implemented. Remove this field from the configuration.`,
        )
      }
      if (this.config.shutdownTimeout !== undefined) {
        throw new Error(
          `LSP server '${this.name}': shutdownTimeout is not yet implemented. Remove this field from the configuration.`,
        )
      }

      await this.disposeProcess()

      const command = String(this.config.command ?? '').trim()
      if (!command) throw new Error('LSP server command is empty')

      const args = Array.isArray(this.config.args) ? this.config.args : []
      const cwd =
        typeof this.config.workspaceFolder === 'string' &&
        this.config.workspaceFolder.trim()
          ? this.config.workspaceFolder.trim()
          : this.rootPath

      const env = buildLspServerProcessEnv({ cwd, env: this.config.env })
      const resolvedCommand =
        resolveExecutableFromEnv({ command, cwd, env }) ?? command

      this.child = spawn(resolvedCommand, args, { stdio: 'pipe', env, cwd })
      this.rpc = new JsonRpcStreamConnection({
        reader: this.child.stdout,
        writer: this.child.stdin,
      })

      this.installLifecycleHandlers()
      this.installRpcHandlers()

      const rootPath = resolve(cwd)
      const rootUri = pathToFileURL(rootPath).href
      const initializeParams: Record<string, unknown> = {
        processId: process.pid,
        initializationOptions: this.config.initializationOptions ?? {},
        workspaceFolders: [{ uri: rootUri, name: basename(rootPath) }],
        rootPath,
        rootUri,
        capabilities: {
          workspace: { configuration: false, workspaceFolders: false },
          textDocument: {
            synchronization: {
              dynamicRegistration: false,
              willSave: false,
              willSaveWaitUntil: false,
              didSave: true,
            },
            publishDiagnostics: {
              relatedInformation: true,
              tagSupport: { valueSet: [1, 2] },
              versionSupport: false,
              codeDescriptionSupport: true,
              dataSupport: false,
            },
            hover: {
              dynamicRegistration: false,
              contentFormat: ['markdown', 'plaintext'],
            },
            definition: { dynamicRegistration: false, linkSupport: true },
            references: { dynamicRegistration: false },
            documentSymbol: {
              dynamicRegistration: false,
              hierarchicalDocumentSymbolSupport: true,
            },
            callHierarchy: { dynamicRegistration: false },
          },
          general: { positionEncodings: ['utf-16'] },
        },
      }

      if (!this.rpc) throw new Error('LSP JSON-RPC connection not started')
      await this.rpc.sendRequest('initialize', initializeParams, {
        timeoutMs: DEFAULT_STARTUP_TIMEOUT_MS,
      })
      await this.rpc.sendNotification('initialized', {})

      this.isInitialized = true
      this.state = 'running'
      this.startTime = new Date()
    } catch (err) {
      const e = asError(err)
      this.lastError = e
      this.state = 'error'
      try {
        await this.disposeProcess()
      } catch {
        // ignore
      }
      throw e
    }
  }

  async stop(): Promise<void> {
    if (this.state === 'stopped' || this.state === 'stopping') return

    this.state = 'stopping'
    try {
      await this.disposeProcess()
      this.state = 'stopped'
    } catch (err) {
      const e = asError(err)
      this.lastError = e
      this.state = 'error'
      throw e
    }
  }

  async restart(): Promise<void> {
    try {
      await this.stop()
    } catch (err) {
      throw new Error(
        `Failed to stop LSP server '${this.name}' during restart: ${asError(err).message}`,
      )
    }

    this.restartCount += 1
    const max = this.config.maxRestarts ?? 3
    if (this.restartCount > max) {
      throw new Error(
        `Max restart attempts (${max}) exceeded for server '${this.name}'`,
      )
    }

    try {
      await this.start()
    } catch (err) {
      throw new Error(
        `Failed to start LSP server '${this.name}' during restart (attempt ${this.restartCount}/${max}): ${asError(err).message}`,
      )
    }
  }

  isHealthy(): boolean {
    return this.state === 'running' && this.isInitialized
  }

  async sendRequest(method: string, params: unknown): Promise<unknown> {
    if (!this.isHealthy() || !this.rpc) {
      const last = this.lastError
        ? `, last error: ${this.lastError.message}`
        : ''
      throw new Error(
        `Cannot send request to LSP server '${this.name}': server is ${this.state}${last}`,
      )
    }

    let lastError: Error | undefined

    for (let attempt = 0; attempt <= MAX_CONTENT_MODIFIED_RETRIES; attempt++) {
      try {
        return await this.rpc.sendRequest(method, params, { timeoutMs: 30_000 })
      } catch (err) {
        const e = asError(err)
        lastError = e

        const code =
          err instanceof JsonRpcResponseError ? err.code : (err as any)?.code
        if (
          typeof code === 'number' &&
          code === CONTENT_MODIFIED_ERROR_CODE &&
          attempt < MAX_CONTENT_MODIFIED_RETRIES
        ) {
          const delay = CONTENT_MODIFIED_RETRY_BASE_MS * Math.pow(2, attempt)
          await sleep(delay)
          continue
        }
        break
      }
    }

    throw new Error(
      `LSP request '${method}' failed for server '${this.name}': ${lastError?.message ?? 'unknown error'}`,
    )
  }

  async sendNotification(method: string, params: unknown): Promise<void> {
    if (!this.isHealthy() || !this.rpc) {
      throw new Error(
        `Cannot send notification to LSP server '${this.name}': server is ${this.state}`,
      )
    }

    try {
      await this.rpc.sendNotification(method, params)
    } catch (err) {
      throw new Error(
        `LSP notification '${method}' failed for server '${this.name}': ${asError(err).message}`,
      )
    }
  }
}
