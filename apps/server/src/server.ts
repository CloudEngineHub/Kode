import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { setCwd, setOriginalCwd } from '@kode/core/utils/state'
import { grantReadPermissionForOriginalDir } from '@kode/core/utils/permissions/filesystem'
import { getClients } from '@kode/core/mcp/client'
import { getTools } from '@kode/tools'

import { serveNode } from './server/serveNode'
import { createTokenChecker } from './server/auth'
import { detectWebuiDir } from './server/webui'
import { createWorkspaceLister } from './handlers/workspaces.handler'
import { createRoutes } from './routes'
import { createWebSocketHandlers } from './ws/connection'
import type { DaemonSession } from './ws/types'
import { SessionRegistry } from './sessionRegistry'
import { processDaemonRuntimeCoordinator } from './turnGate'

type WebSocketData = {
  session: DaemonSession
  replayHistory: boolean
  correlatedEvents: boolean
  afterSequence: number | null
}

export type KodeDaemon = {
  url: string
  host: string
  port: number
  token: string
  stop: () => void
}

export async function startKodeDaemon(args: {
  host?: string
  port?: number
  cwd: string
  token?: string
  webuiDir?: string
  /**
   * Test-only mode: never calls an LLM, replies by echoing user prompt.
   */
  echo?: boolean
  /** Test-only delay used to keep an echo turn in flight deterministically. */
  echoDelayMs?: number
}): Promise<KodeDaemon> {
  const host = args.host ?? '127.0.0.1'
  const port = args.port ?? 0
  const token = args.token ?? crypto.randomUUID().replace(/-/g, '').slice(0, 9)
  const cwd = resolve(args.cwd)
  const echo = args.echo === true || process.env.KODE_DAEMON_ECHO === '1'
  const echoDelayMs = Math.max(0, args.echoDelayMs ?? 0)

  const moduleDir = dirname(fileURLToPath(import.meta.url))
  const webuiDir =
    typeof args.webuiDir === 'string'
      ? args.webuiDir
      : detectWebuiDir(moduleDir)
  const webuiRoot = webuiDir ? resolve(webuiDir) : null

  const [tools, mcpClients] =
    await processDaemonRuntimeCoordinator.runStartupExclusive(async () => {
      setOriginalCwd(cwd)
      await setCwd(cwd)
      grantReadPermissionForOriginalDir()
      return await Promise.all([getTools(), getClients()])
    })
  const toolNames = tools.map(t => t.name)
  const commands: unknown[] = []
  const slashCommands: string[] = []

  const sessions = new Map<string, DaemonSession>()
  const sessionRegistry = new SessionRegistry(sessions)
  const turnGate = processDaemonRuntimeCoordinator
  const checkToken = createTokenChecker({ token })
  const workspaces = createWorkspaceLister({ cwd })

  const routes = createRoutes({
    webuiRoot,
    checkToken,
    listWorkspaces: workspaces.listWorkspaces,
    sessionRegistry,
    turnGate,
    cwd,
    echo,
    echoDelayMs,
    commands,
    tools,
    toolNames,
    slashCommands,
    mcpClients,
  })

  const websocket = createWebSocketHandlers({
    sessionRegistry,
    turnGate,
    toolNames,
    slashCommands,
    commands,
    tools,
    echo,
    echoDelayMs,
    mcpClients,
  })

  const server = await serveNode<WebSocketData>({
    hostname: host,
    port,
    fetch: routes.fetch,
    websocket,
  })

  const displayHost = host === '127.0.0.1' ? 'localhost' : host

  let stopped = false
  return {
    url: `http://${displayHost}:${server.port}?token=${encodeURIComponent(token)}`,
    host,
    port: server.port,
    token,
    stop: () => {
      if (stopped) return
      stopped = true
      try {
        sessionRegistry.cancelActiveWork('Daemon stopped')
      } catch {}
      try {
        server.stop(true)
      } catch {}
    },
  }
}
