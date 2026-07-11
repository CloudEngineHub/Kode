import { describe, expect, test } from 'bun:test'

import { PermissionControlService } from '../permissionControlService'
import { SessionRegistry } from '../sessionRegistry'
import { routePermission } from './permission'

describe('routePermission', () => {
  test('rejects malformed updates before they reach the permission service', async () => {
    const registry = new SessionRegistry()
    const service = new PermissionControlService(registry, {
      audit: () => {},
    })
    const response = await routePermission(
      new Request('http://localhost/api/permissions', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          update: {
            type: 'addRules',
            destination: 'session',
            behavior: 'allow',
            rules: ['Bash(*)'],
            ignored: true,
          },
        }),
      }),
      { cwd: 'C:/repo', permissionService: service },
    )

    expect(response?.status).toBe(400)
    await expect(response?.json()).resolves.toEqual({
      ok: false,
      error: 'Invalid permission update',
    })
  })

  test('hides a session from another workspace', async () => {
    const registry = new SessionRegistry()
    const session = registry.create('C:/repo')
    const service = new PermissionControlService(registry, {
      audit: () => {},
    })
    const response = await routePermission(
      new Request(
        `http://localhost/api/permissions?workspace=other&sessionId=${session.sessionId}`,
      ),
      {
        cwd: 'C:/repo',
        permissionService: service,
        listWorkspaces: async () => ({
          currentId: 'repo',
          workspaces: [
            { id: 'repo', path: 'C:/repo' },
            { id: 'other', path: 'C:/other' },
          ],
        }),
      },
    )

    expect(response?.status).toBe(404)
    await expect(response?.json()).resolves.toEqual({
      ok: false,
      error: 'Session not found',
    })
  })
})
