import { basename, resolve } from 'node:path'

import { loadToolPermissionContextFromDisk } from '@kode/core/utils/permissions/toolPermissionSettings'
import type { Tool } from '@kode/core/tooling/Tool'
import type { WrappedClient } from '@kode/core/mcp/client'
import { isUuid } from '@kode/core/utils/uuid'

import { maybeServeWebui } from '../server/webui'
import { routeChat } from './chat'
import { routeSession } from './session'
import type { WorkspaceInfo } from '../handlers/workspaces.handler'
import type { DaemonSession } from '../ws/types'

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
  sessions: Map<string, DaemonSession>
  cwd: string
  echo: boolean
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
          activeSessions: args.sessions.size,
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
        sessions: args.sessions,
        echo: args.echo,
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
        const { workspaces, currentId } = await args.listWorkspaces()
        const requested = url.searchParams.get('workspace')
        const selected =
          requested && workspaces.some(w => w.id === requested)
            ? requested
            : currentId
        const selectedCwd =
          workspaces.find(w => w.id === selected)?.path ?? resolve(args.cwd)

        const requestedSessionId =
          url.searchParams.get('session_id') ??
          url.searchParams.get('sessionId') ??
          ''
        const existing =
          isUuid(requestedSessionId) && args.sessions.has(requestedSessionId)
            ? (args.sessions.get(requestedSessionId) ?? null)
            : null
        const canAttachExisting =
          existing !== null && resolve(existing.cwd) === resolve(selectedCwd)

        const session =
          existing && canAttachExisting
            ? existing
            : (() => {
                const sessionId = crypto.randomUUID()
                const next: DaemonSession = {
                  sessionId,
                  cwd: selectedCwd,
                  clients: new Set(),
                  messages: [],
                  readFileTimestamps: {},
                  responseState: {},
                  toolPermissionContext: loadToolPermissionContextFromDisk({
                    projectDir: selectedCwd,
                    includeKodeProjectConfig: true,
                    isBypassPermissionsModeAvailable: true,
                  }),
                  activeAbortController: null,
                  inflightPermissionRequests: new Map(),
                }
                args.sessions.set(sessionId, next)
                return next
              })()

        const ok = server.upgrade(req, {
          data: { session, replayHistory: canAttachExisting },
        })
        return ok ? undefined : new Response('Upgrade failed', { status: 400 })
      }

      return new Response('Not found', { status: 404 })
    },
  }
}
