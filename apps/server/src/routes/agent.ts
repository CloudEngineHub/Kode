import { resolve } from 'node:path'

import {
  DaemonAgentCreateRequestSchema,
  DaemonAgentDeleteRequestSchema,
  DaemonAgentSourceSchema,
  DaemonAgentUpdateRequestSchema,
} from '@kode/protocol'

import {
  AgentControlService,
  type AgentControlFailure,
} from '../agentControlService'

type AgentRouteContext = {
  cwd: string
  agentService: AgentControlService
  listWorkspaces?: () => Promise<{
    workspaces: Array<{ id: string; path: string }>
    currentId: string
  }>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function responseForFailure(reason: AgentControlFailure): Response {
  if (reason === 'invalid') {
    return Response.json(
      { ok: false, error: 'Invalid agent configuration' },
      { status: 400 },
    )
  }
  if (reason === 'already_exists' || reason === 'revision_conflict') {
    return Response.json(
      { ok: false, error: 'Agent configuration conflict' },
      { status: 409 },
    )
  }
  if (reason === 'legacy_read_only') {
    return Response.json(
      { ok: false, error: 'Agent configuration is read-only' },
      { status: 403 },
    )
  }
  if (reason === 'persistence_failed') {
    return Response.json(
      { ok: false, error: 'Failed to persist agent configuration' },
      { status: 500 },
    )
  }
  return Response.json({ ok: false, error: 'Agent not found' }, { status: 404 })
}

function parseSource(
  value: unknown,
):
  | { ok: true; source: 'userSettings' | 'projectSettings' }
  | { ok: false; response: Response } {
  const parsed = DaemonAgentSourceSchema.safeParse(value)
  if (parsed.success) return { ok: true, source: parsed.data }
  return {
    ok: false,
    response: Response.json(
      { ok: false, error: 'Invalid mutable agent source' },
      { status: 400 },
    ),
  }
}

async function parseBody(
  req: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await req.json()
    return isRecord(value) ? value : null
  } catch {
    return null
  }
}

export async function routeAgent(
  req: Request,
  ctx: AgentRouteContext,
): Promise<Response | undefined> {
  const url = new URL(req.url)
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts[0] !== 'api' || parts[1] !== 'agents') return undefined
  if (parts.length > 3) return new Response('Not Found', { status: 404 })

  const cwd = await resolveAgentCwd(url, ctx, {
    requireWorkspace: ['POST', 'PATCH', 'DELETE'].includes(req.method),
  })
  if (cwd.ok === false) return cwd.response
  const agentType = parts[2]?.trim() ?? ''

  if (!agentType) {
    if (req.method === 'GET') {
      return Response.json({ agents: ctx.agentService.list({ cwd: cwd.cwd }) })
    }
    if (req.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }
    const body = await parseBody(req)
    const parsed = DaemonAgentCreateRequestSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json(
        { ok: false, error: 'Invalid agent create request' },
        { status: 400 },
      )
    }
    const result = await ctx.agentService.create({
      cwd: cwd.cwd,
      source: parsed.data.source,
      agent: parsed.data.agent,
    })
    if (result.ok === false) return responseForFailure(result.reason)
    return Response.json(result.value, { status: 201 })
  }

  if (req.method === 'GET') {
    const source = parseSource(url.searchParams.get('source'))
    if (source.ok === false) return source.response
    const result = ctx.agentService.get({
      cwd: cwd.cwd,
      source: source.source,
      agentType,
    })
    if (result.ok === false) return responseForFailure(result.reason)
    return Response.json({ agent: result.value })
  }

  if (req.method === 'PATCH') {
    const body = await parseBody(req)
    const parsed = DaemonAgentUpdateRequestSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json(
        { ok: false, error: 'Invalid agent update request' },
        { status: 400 },
      )
    }
    const result = await ctx.agentService.update({
      cwd: cwd.cwd,
      source: parsed.data.source,
      agentType,
      expectedRevision: parsed.data.expectedRevision,
      agent: parsed.data.agent,
    })
    if (result.ok === false) return responseForFailure(result.reason)
    return Response.json(result.value)
  }

  if (req.method === 'DELETE') {
    const body = await parseBody(req)
    const parsed = DaemonAgentDeleteRequestSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json(
        { ok: false, error: 'Invalid agent delete request' },
        { status: 400 },
      )
    }
    const result = await ctx.agentService.delete({
      cwd: cwd.cwd,
      source: parsed.data.source,
      agentType,
      expectedRevision: parsed.data.expectedRevision,
    })
    if (result.ok === false) return responseForFailure(result.reason)
    return Response.json(result.value)
  }

  return new Response('Method Not Allowed', { status: 405 })
}

async function resolveAgentCwd(
  url: URL,
  ctx: Pick<AgentRouteContext, 'cwd' | 'listWorkspaces'>,
  options?: { requireWorkspace?: boolean },
): Promise<{ ok: true; cwd: string } | { ok: false; response: Response }> {
  const fallback = resolve(ctx.cwd)
  const requested = url.searchParams.get('workspace')
  if (!requested) {
    if (options?.requireWorkspace) {
      return {
        ok: false,
        response: Response.json(
          { ok: false, error: 'Workspace is required' },
          { status: 400 },
        ),
      }
    }
    return { ok: true, cwd: fallback }
  }
  if (!ctx.listWorkspaces) {
    return {
      ok: false,
      response: Response.json(
        { ok: false, error: 'Workspace not found' },
        { status: 404 },
      ),
    }
  }
  try {
    const { workspaces } = await ctx.listWorkspaces()
    const selected = workspaces.find(workspace => workspace.id === requested)
    if (!selected) {
      return {
        ok: false,
        response: Response.json(
          { ok: false, error: 'Workspace not found' },
          { status: 404 },
        ),
      }
    }
    return { ok: true, cwd: resolve(selected.path) }
  } catch {
    return {
      ok: false,
      response: Response.json(
        { ok: false, error: 'Workspace not found' },
        { status: 404 },
      ),
    }
  }
}

export const __routeAgentForTests = {
  parseSource,
  resolveAgentCwd,
}
