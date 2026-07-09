import { basename, resolve } from 'node:path'

import type { Tool } from '@kode/core/tooling/Tool'
import type { WrappedClient } from '@kode/core/mcp/client'
import { isUuid } from '@kode/core/utils/uuid'

import { maybeServeWebui } from '../server/webui'
import { routeChat } from './chat'
import { routeSession } from './session'
import type { WorkspaceInfo } from '../handlers/workspaces.handler'
import type { DaemonSession } from '../ws/types'
import type { SessionRegistry } from '../sessionRegistry'
import type { DaemonTurnGate } from '../turnGate'

type UpgradeServer<TData> = {
  upgrade: (req: Request, options: { data: TData }) => boolean
}

type WebSocketData = {
  session: DaemonSession
  replayHistory: boolean
}

export function createRoutes(args: {
  webuiRoot: string | null
  checkToken: (req: Request) => boolean
  listWorkspaces: () => Promise<{
    workspaces: WorkspaceInfo[]
    currentId: string
  }>
  sessionRegistry: SessionRegistry
  turnGate: DaemonTurnGate
  cwd: string
  echo: boolean
  echoDelayMs: number
  commands: unknown[]
  tools: Tool[]
  toolNames: string[]
  slashCommands: string[]
  mcpClients: WrappedClient[]
}): {
  fetch: (
    req: Request,
    server: UpgradeServer<WebSocketData>,
  ) => Promise<Response | undefined>
} {
  const resolveWorkspaceCwd = async (url: URL): Promise<string> => {
    const fallback = resolve(args.cwd)
    try {
      const { workspaces, currentId } = await args.listWorkspaces()
      const requested = url.searchParams.get('workspace')
      const selected =
        requested && workspaces.some(w => w.id === requested)
          ? requested
          : currentId
      return workspaces.find(w => w.id === selected)?.path ?? fallback
    } catch {
      return fallback
    }
  }

  return {
    async fetch(req, server) {
      const url = new URL(req.url)

      if (args.webuiRoot) {
        const response = maybeServeWebui({ webuiRoot: args.webuiRoot, url })
        if (response) return response
      }

      if (url.pathname === '/health') {
        return Response.json({
          ok: true,
          version: process.env.npm_package_version ?? null,
          pid: process.pid,
        })
      }

      if (url.pathname === '/api/health') {
        if (!args.checkToken(req))
          return new Response('Unauthorized', { status: 401 })
        return Response.json({
          ok: true,
          transport: 'daemon',
          version: process.env.npm_package_version ?? null,
          pid: process.pid,
          activeSessions: args.sessionRegistry.size,
        })
      }

      if (url.pathname.startsWith('/api/')) {
        if (!args.checkToken(req))
          return new Response('Unauthorized', { status: 401 })
      }

      if (url.pathname === '/api/workspaces') {
        try {
          const { workspaces, currentId } = await args.listWorkspaces()
          return Response.json({ workspaces, currentId })
        } catch (err) {
          const only = resolve(args.cwd)
          return Response.json(
            {
              workspaces: [
                {
                  id: only,
                  path: only,
                  title: basename(only) || only,
                  branch: null,
                  isCurrent: true,
                },
              ],
              currentId: only,
              error: err instanceof Error ? err.message : String(err),
            },
            { status: 200 },
          )
        }
      }

      const chatResponse = await routeChat(req, {
        sessionRegistry: args.sessionRegistry,
        turnGate: args.turnGate,
        resolveCwd: () => resolveWorkspaceCwd(url),
        echo: args.echo,
        echoDelayMs: args.echoDelayMs,
        commands: args.commands,
        tools: args.tools,
        toolNames: args.toolNames,
        slashCommands: args.slashCommands,
        mcpClients: args.mcpClients,
      })
      if (chatResponse) return chatResponse

      const sessionResponse = await routeSession(req, {
        cwd: args.cwd,
        listWorkspaces: args.listWorkspaces,
      })
      if (sessionResponse) return sessionResponse

      if (url.pathname === '/ws') {
        if (!args.checkToken(req))
          return new Response('Unauthorized', { status: 401 })
        const selectedCwd = await resolveWorkspaceCwd(url)

        const requestedSessionId =
          url.searchParams.get('session_id') ??
          url.searchParams.get('sessionId') ??
          ''
        let session: DaemonSession
        let replayHistory = false
        let removeOnUpgradeFailure = false
        if (requestedSessionId) {
          if (!isUuid(requestedSessionId)) {
            return new Response('Invalid session id', { status: 400 })
          }
          const found = args.sessionRegistry.getOrLoad({
            cwd: selectedCwd,
            sessionId: requestedSessionId,
          })
          if (found.ok === false) {
            return new Response(
              found.reason === 'cwd_mismatch'
                ? 'Session workspace mismatch'
                : 'Unknown session',
              { status: found.reason === 'cwd_mismatch' ? 409 : 404 },
            )
          }
          session = found.session
          replayHistory = true
          removeOnUpgradeFailure = found.restored
        } else {
          session = args.sessionRegistry.create(selectedCwd)
          removeOnUpgradeFailure = true
        }

        let ok = false
        try {
          ok = server.upgrade(req, {
            data: { session, replayHistory },
          })
        } finally {
          if (!ok && removeOnUpgradeFailure) {
            args.sessionRegistry.deleteIfIdle(session)
          }
        }
        return ok ? undefined : new Response('Upgrade failed', { status: 400 })
      }

      return new Response('Not found', { status: 404 })
    },
  }
}
