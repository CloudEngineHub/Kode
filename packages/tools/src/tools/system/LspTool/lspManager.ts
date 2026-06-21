import { extname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ResolvedLspServerConfig } from './lspConfig'
import { LspServer } from './lspServer'

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  if (Array.isArray(value)) return null
  return value as Record<string, unknown>
}

export class LspServerManager {
  private readonly servers = new Map<string, LspServer>()
  private readonly extensionToServerNames = new Map<string, string[]>()
  private readonly openFileServerByUri = new Map<string, string>()

  constructor(servers: ResolvedLspServerConfig[]) {
    for (const server of servers) {
      const rootPath =
        typeof server.workspaceFolder === 'string' &&
        server.workspaceFolder.trim()
          ? server.workspaceFolder.trim()
          : process.cwd()

      try {
        const instance = new LspServer({
          name: server.name,
          config: server,
          rootPath,
        })

        this.servers.set(server.name, instance)
        instance.onRequest('workspace/configuration', params => {
          const rec = asRecord(params)
          const items = rec && Array.isArray(rec.items) ? rec.items : []
          return items.map(() => null)
        })

        const mapping = server.extensionToLanguage ?? {}
        for (const ext of Object.keys(mapping)) {
          const key = ext.toLowerCase()
          const list = this.extensionToServerNames.get(key) ?? []
          list.push(server.name)
          this.extensionToServerNames.set(key, list)
        }
      } catch {
        continue
      }
    }

    // Keep the manager focused on "query" operations (definition, hover, refs, symbols).
  }

  async initialize(): Promise<void> {
    const starts: Promise<void>[] = []
    for (const server of this.servers.values()) {
      starts.push(server.start().catch(() => {}))
    }
    await Promise.allSettled(starts)
  }

  async shutdown(): Promise<void> {
    const errors: Error[] = []

    for (const [name, server] of this.servers.entries()) {
      if (server.state !== 'running') continue
      try {
        await server.stop()
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e))
        errors.push(
          new Error(`Failed to stop LSP server ${name}: ${err.message}`),
        )
      }
    }

    this.servers.clear()
    this.extensionToServerNames.clear()
    this.openFileServerByUri.clear()

    if (errors.length > 0) {
      throw new Error(
        `Failed to stop ${errors.length} LSP server(s): ${errors
          .map(e => e.message)
          .join('; ')}`,
      )
    }
  }

  getAllServers(): Map<string, LspServer> {
    return this.servers
  }

  getServerForFile(filePath: string): LspServer | undefined {
    const abs = resolve(filePath)
    const ext = extname(abs).toLowerCase()
    const servers = this.extensionToServerNames.get(ext)
    if (!servers || servers.length === 0) return undefined
    const firstName = servers[0]
    if (!firstName) return undefined
    return this.servers.get(firstName)
  }

  async ensureServerStarted(filePath: string): Promise<LspServer | undefined> {
    const server = this.getServerForFile(filePath)
    if (!server) return undefined
    if (server.state === 'stopped') {
      await server.start()
    }
    return server
  }

  async sendRequest(
    filePath: string,
    method: string,
    params: unknown,
  ): Promise<unknown | undefined> {
    const server = await this.ensureServerStarted(filePath)
    if (!server) return undefined
    return await server.sendRequest(method, params)
  }

  async openFile(filePath: string, content: string): Promise<void> {
    const server = await this.ensureServerStarted(filePath)
    if (!server) return

    const abs = resolve(filePath)
    const uri = pathToFileURL(abs).href

    if (this.openFileServerByUri.get(uri) === server.name) {
      return
    }

    const ext = extname(abs).toLowerCase()
    const languageId = server.config.extensionToLanguage?.[ext] ?? 'plaintext'

    const version = 1
    await server.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId,
        version,
        text: content,
      },
    })

    this.openFileServerByUri.set(uri, server.name)
  }

  async changeFile(filePath: string, content: string): Promise<void> {
    const server = this.getServerForFile(filePath)
    if (!server || server.state !== 'running') {
      await this.openFile(filePath, content)
      return
    }

    const abs = resolve(filePath)
    const uri = pathToFileURL(abs).href

    if (this.openFileServerByUri.get(uri) !== server.name) {
      await this.openFile(filePath, content)
      return
    }

    const nextVersion = 1
    await server.sendNotification('textDocument/didChange', {
      textDocument: { uri, version: nextVersion },
      contentChanges: [{ text: content }],
    })
  }

  async saveFile(filePath: string): Promise<void> {
    const server = this.getServerForFile(filePath)
    if (!server || server.state !== 'running') return

    const abs = resolve(filePath)
    await server.sendNotification('textDocument/didSave', {
      textDocument: { uri: pathToFileURL(abs).href },
    })
  }

  async closeFile(filePath: string): Promise<void> {
    const server = this.getServerForFile(filePath)
    if (!server || server.state !== 'running') return

    const abs = resolve(filePath)
    const uri = pathToFileURL(abs).href
    await server.sendNotification('textDocument/didClose', {
      textDocument: { uri },
    })
    this.openFileServerByUri.delete(uri)
  }

  isFileOpen(filePath: string): boolean {
    const uri = pathToFileURL(resolve(filePath)).href
    return this.openFileServerByUri.has(uri)
  }

  async dispose(): Promise<void> {
    await this.shutdown()
  }
}
