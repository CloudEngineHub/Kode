import { describe, expect, test } from 'bun:test'

import { createRoutes } from './index'

function createTestRoutes(args?: {
  authorized?: boolean
  activeSessions?: number
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
      ],
    }),
    sessions: new Map(
      Array.from({ length: args?.activeSessions ?? 0 }, (_, index) => [
        `session-${index}`,
        {} as never,
      ]),
    ),
    cwd: 'C:/repo',
    echo: true,
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
})
