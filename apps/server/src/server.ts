import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { setCwd, setOriginalCwd } from '@kode/core/utils/state'
import { grantReadPermissionForOriginalDir } from '@kode/core/utils/permissions/filesystem'
import { getTools } from '@kode/tools'

import { serveNode } from './server/serveNode'
import { createTokenChecker } from './server/auth'
import { detectWebuiDir } from './server/webui'
import { createWorkspaceLister } from './handlers/workspaces.handler'
import { createRoutes } from './routes'
import { createWebSocketHandlers } from './ws/connection'
import type { DaemonSession } from './ws/types'

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
}): Promise<KodeDaemon> {
  const host = args.host ?? '127.0.0.1'
  const port = args.port ?? 0
  const token = args.token ?? crypto.randomUUID().replace(/-/g, '').slice(0, 9)
  const cwd = resolve(args.cwd)
  const echo = args.echo === true || process.env.KODE_DAEMON_ECHO === '1'

  const moduleDir = dirname(fileURLToPath(import.meta.url))
  const webuiDir =
    typeof args.webuiDir === 'string'
      ? args.webuiDir
      : detectWebuiDir(moduleDir)
  const webuiRoot = webuiDir ? resolve(webuiDir) : null

  setOriginalCwd(cwd)
  await setCwd(cwd)
  grantReadPermissionForOriginalDir()

  const tools = await getTools()
  const toolNames = tools.map(t => t.name)
  const commands: unknown[] = []
  const slashCommands: string[] = []

  const sessions = new Map<string, DaemonSession>()
  const checkToken = createTokenChecker({ token })
  const workspaces = createWorkspaceLister({ cwd })

  const routes = createRoutes({
    webuiRoot,
    checkToken,
    listWorkspaces: workspaces.listWorkspaces,
    sessions,
    cwd,
    echo,
    commands,
    tools,
    toolNames,
    slashCommands,
  })

  const websocket = createWebSocketHandlers({
    sessions,
    toolNames,
    slashCommands,
    commands,
    tools,
    echo,
  })

  const server = await serveNode<{ session: DaemonSession }>({
    hostname: host,
    port,
    fetch: routes.fetch,
    websocket,
  })

  const displayHost = host === '127.0.0.1' ? 'localhost' : host

  return {
    url: `http://${displayHost}:${server.port}?token=${encodeURIComponent(token)}`,
    host,
    port: server.port,
    token,
    stop: () => {
      try {
        server.stop(true)
      } catch {}
    },
  }
}
