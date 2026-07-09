import { describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'

import { __routeSessionForTests } from './session'

const { resolveSessionCwd } = __routeSessionForTests

describe('routeSession helpers', () => {
  test('resolves the requested workspace cwd for session history routes', async () => {
    const cwd = await resolveSessionCwd(
      new URL('http://localhost/api/sessions?workspace=repo-b'),
      {
        cwd: 'C:/repo-a',
        listWorkspaces: async () => ({
          currentId: 'repo-a',
          workspaces: [
            { id: 'repo-a', path: 'C:/repo-a' },
            { id: 'repo-b', path: 'C:/repo-b' },
          ],
        }),
      },
    )

    expect(cwd).toBe(resolve('C:/repo-b'))
  })

  test('falls back to daemon cwd when no workspace is requested', async () => {
    const cwd = await resolveSessionCwd(
      new URL('http://localhost/api/sessions'),
      {
        cwd: 'C:/repo-a',
        listWorkspaces: async () => {
          throw new Error('should not load workspaces')
        },
      },
    )

    expect(cwd).toBe(resolve('C:/repo-a'))
  })

  test('falls back to current workspace when requested workspace is unknown', async () => {
    const cwd = await resolveSessionCwd(
      new URL('http://localhost/api/sessions?workspace=missing'),
      {
        cwd: 'C:/repo-a',
        listWorkspaces: async () => ({
          currentId: 'repo-a',
          workspaces: [
            { id: 'repo-a', path: 'C:/repo-a' },
            { id: 'repo-b', path: 'C:/repo-b' },
          ],
        }),
      },
    )

    expect(cwd).toBe(resolve('C:/repo-a'))
  })
})
