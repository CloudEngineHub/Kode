import { describe, expect, test } from 'bun:test'

import { createRoutes } from './index'
import { SessionRegistry } from '../sessionRegistry'
import { DaemonTurnGate } from '../turnGate'

function createTestRoutes(args?: {
  authorized?: boolean
  activeSessions?: number
  sessionRegistry?: SessionRegistry
  includeOtherWorkspace?: boolean
}) {
  return createRoutes({
    webuiRoot: null,
    checkToken: () => args?.authorized !== false,
    listWorkspaces: async () => ({
      currentId: 'repo',
      workspaces: [
        {
          id: 'repo',
          path: 'C:/repo',
          title: 'repo',
          branch: null,
          isCurrent: true,
        },
        ...(args?.includeOtherWorkspace
          ? [
              {
                id: 'other',
                path: 'C:/other',
                title: 'other',
                branch: null,
                isCurrent: false,
              },
            ]
          : []),
      ],
    }),
    sessionRegistry:
      args?.sessionRegistry ??
      new SessionRegistry(
        new Map(
          Array.from({ length: args?.activeSessions ?? 0 }, (_, index) => [
            `session-${index}`,
            {} as never,
          ]),
        ),
      ),
    turnGate: new DaemonTurnGate(),
    cwd: 'C:/repo',
    echo: true,
    echoDelayMs: 0,
    commands: [],
    tools: [],
    toolNames: [],
    slashCommands: [],
    mcpClients: [],
  })
}

describe('createRoutes health endpoint', () => {
  test('returns authenticated daemon runtime status', async () => {
    const routes = createTestRoutes({ activeSessions: 2 })
    const response = await routes.fetch(
      new Request('http://localhost/api/health'),
      { upgrade: () => false },
    )

    if (!response) throw new Error('missing response')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      transport: 'daemon',
      pid: process.pid,
      activeSessions: 2,
    })
  })

  test('rejects unauthenticated daemon runtime status requests', async () => {
    const routes = createTestRoutes({ authorized: false })
    const response = await routes.fetch(
      new Request('http://localhost/api/health'),
      { upgrade: () => false },
    )

    if (!response) throw new Error('missing response')

    expect(response.status).toBe(401)
  })

  test('rejects HTTP prompts when an active session belongs to another workspace', async () => {
    const sessionRegistry = new SessionRegistry()
    const session = sessionRegistry.create('C:/repo')
    const routes = createTestRoutes({
      sessionRegistry,
      includeOtherWorkspace: true,
    })

    const response = await routes.fetch(
      new Request('http://localhost/api/chat?workspace=other', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: session.sessionId, prompt: 'hello' }),
      }),
      { upgrade: () => false },
    )

    if (!response) throw new Error('missing response')

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Session workspace mismatch',
    })
  })

  test('does not retain a new session when WebSocket upgrade fails', async () => {
    const sessionRegistry = new SessionRegistry()
    const routes = createTestRoutes({ sessionRegistry })

    const response = await routes.fetch(new Request('http://localhost/ws'), {
      upgrade: () => false,
    })

    if (!response) throw new Error('missing response')

    expect(response.status).toBe(400)
    expect(await response.text()).toBe('Upgrade failed')
    expect(sessionRegistry.size).toBe(0)
  })

  test('passes the opt-in correlation capability and cursor to WebSocket handlers', async () => {
    const sessionRegistry = new SessionRegistry()
    const routes = createTestRoutes({ sessionRegistry })
    let data: Record<string, unknown> | null = null

    const response = await routes.fetch(
      new Request('http://localhost/ws?correlatedEvents=1&afterSequence=12'),
      {
        upgrade: (_request, options) => {
          data = options.data as unknown as Record<string, unknown>
          return true
        },
      },
    )

    expect(response).toBeUndefined()
    expect(data).toMatchObject({
      correlatedEvents: true,
      afterSequence: 12,
      replayHistory: false,
    })
  })

  test('rejects invalid correlation cursors before creating an upgrade session', async () => {
    const sessionRegistry = new SessionRegistry()
    const routes = createTestRoutes({ sessionRegistry })

    const response = await routes.fetch(
      new Request('http://localhost/ws?correlatedEvents=1&afterSequence=-1'),
      { upgrade: () => false },
    )

    if (!response) throw new Error('missing response')
    expect(response.status).toBe(400)
    expect(await response.text()).toBe('Invalid afterSequence')
    expect(sessionRegistry.size).toBe(0)
  })

  test('cleans a new session before propagating a thrown upgrade error', async () => {
    const sessionRegistry = new SessionRegistry()
    const routes = createTestRoutes({ sessionRegistry })

    await expect(
      routes.fetch(new Request('http://localhost/ws'), {
        upgrade: () => {
          throw new Error('upgrade crashed')
        },
      }),
    ).rejects.toThrow('upgrade crashed')
    expect(sessionRegistry.size).toBe(0)
  })
})
