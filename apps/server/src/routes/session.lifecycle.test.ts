import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import {
  createAssistantMessage,
  createUserMessage,
} from '@kode/core/utils/messages'

import { PersistentSessionService } from '../persistentSessionService'
import { SessionRegistry } from '../sessionRegistry'
import { routeSession } from './session'

const temporaryDirectories: string[] = []
const originalConfigDir = process.env.KODE_CONFIG_DIR

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 'kode-session-route-'))
  const cwd = join(root, 'project')
  const otherCwd = join(root, 'other-project')
  temporaryDirectories.push(root)
  process.env.KODE_CONFIG_DIR = join(root, 'config')

  const registry = new SessionRegistry()
  const service = new PersistentSessionService(registry)
  const user = createUserMessage('route source prompt')
  user.uuid = '11111111-1111-4111-8111-111111111111' as typeof user.uuid
  const assistant = createAssistantMessage('route source reply')
  assistant.uuid =
    '22222222-2222-4222-8222-222222222222' as typeof assistant.uuid
  const source = registry.createFromMessages({
    cwd,
    sessionId: '33333333-3333-4333-8333-333333333333',
    messages: [user, assistant],
  })

  return {
    cwd,
    otherCwd,
    registry,
    service,
    source,
    ctx: {
      cwd,
      sessionService: service,
      sessionRegistry: registry,
      listWorkspaces: async () => ({
        currentId: 'project',
        workspaces: [
          { id: 'project', path: cwd },
          { id: 'other', path: otherCwd },
        ],
      }),
    },
  }
}

async function requireResponse(
  response: Response | undefined,
): Promise<Response> {
  if (!response) throw new Error('Expected a route response')
  return response
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop()
    if (directory) rmSync(directory, { recursive: true, force: true })
  }
  if (originalConfigDir === undefined) delete process.env.KODE_CONFIG_DIR
  else process.env.KODE_CONFIG_DIR = originalConfigDir
})

describe('persistent session HTTP routes', () => {
  test('forks a live transcript and persists metadata through detail reloads', async () => {
    const fixture = createFixture()
    const childId = '44444444-4444-4444-8444-444444444444'
    const forkResponse = await requireResponse(
      await routeSession(
        new Request(
          `http://localhost/api/sessions/${fixture.source.sessionId}/fork`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              newSessionId: childId,
              beforeUuid: '22222222-2222-4222-8222-222222222222',
              customTitle: 'Forked route session',
              tag: 'api',
              summary: 'Route metadata survives restart',
            }),
          },
        ),
        fixture.ctx,
      ),
    )

    expect(forkResponse.status).toBe(200)
    await expect(forkResponse.json()).resolves.toMatchObject({
      ok: true,
      sessionId: childId,
      session: {
        forkedFromSessionId: fixture.source.sessionId,
        forkRootSessionId: fixture.source.sessionId,
      },
    })

    const patchResponse = await requireResponse(
      await routeSession(
        new Request(`http://localhost/api/sessions/${childId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ customTitle: null, tag: null }),
        }),
        fixture.ctx,
      ),
    )
    expect(patchResponse.status).toBe(200)

    const detailResponse = await requireResponse(
      await routeSession(
        new Request(`http://localhost/api/sessions/${childId}`),
        fixture.ctx,
      ),
    )
    expect(detailResponse.status).toBe(200)
    await expect(detailResponse.json()).resolves.toMatchObject({
      sessionId: childId,
      customTitle: null,
      tag: null,
      summary: 'Route metadata survives restart',
      forkedFromSessionId: fixture.source.sessionId,
      forkRootSessionId: fixture.source.sessionId,
      events: [{ type: 'user' }, { type: 'assistant' }],
    })
  })

  test('protects active sessions, archives idle sessions, and makes delete idempotent', async () => {
    const fixture = createFixture()
    fixture.source.clients.add({ send: () => {} })

    const activeArchivePatch = await requireResponse(
      await routeSession(
        new Request(
          `http://localhost/api/sessions/${fixture.source.sessionId}`,
          {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ archived: true }),
          },
        ),
        fixture.ctx,
      ),
    )
    expect(activeArchivePatch.status).toBe(409)

    const activeDelete = await requireResponse(
      await routeSession(
        new Request(
          `http://localhost/api/sessions/${fixture.source.sessionId}`,
          { method: 'DELETE' },
        ),
        fixture.ctx,
      ),
    )
    expect(activeDelete.status).toBe(409)

    fixture.source.clients.clear()
    let sessionListPayload: unknown = null
    const observer = fixture.registry.create(fixture.cwd)
    observer.clients.add({
      send: data => {
        sessionListPayload = JSON.parse(data)
      },
    })
    const archivedPatch = await requireResponse(
      await routeSession(
        new Request(
          `http://localhost/api/sessions/${fixture.source.sessionId}`,
          {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ archived: true }),
          },
        ),
        fixture.ctx,
      ),
    )
    expect(archivedPatch.status).toBe(200)
    await expect(archivedPatch.json()).resolves.toMatchObject({
      ok: true,
      session: { archivedAt: expect.any(String) },
    })
    expect(sessionListPayload).toMatchObject({ type: 'session_list' })
    const listPayload = sessionListPayload as {
      sessions?: Array<{ sessionId?: string }>
    }
    expect(
      listPayload.sessions?.map(session => session.sessionId),
    ).not.toContain(fixture.source.sessionId)
    expect(listPayload.sessions?.map(session => session.sessionId)).toContain(
      observer.sessionId,
    )

    const archivedDetail = await requireResponse(
      await routeSession(
        new Request(
          `http://localhost/api/sessions/${fixture.source.sessionId}`,
        ),
        fixture.ctx,
      ),
    )
    expect(archivedDetail.status).toBe(410)

    const repeatedDelete = await requireResponse(
      await routeSession(
        new Request(
          `http://localhost/api/sessions/${fixture.source.sessionId}`,
          { method: 'DELETE' },
        ),
        fixture.ctx,
      ),
    )
    expect(repeatedDelete.status).toBe(200)
    await expect(repeatedDelete.json()).resolves.toMatchObject({
      ok: true,
      archived: true,
    })
  })

  test('maps metadata validation and persistence failures without exposing I/O errors', async () => {
    const fixture = createFixture()
    const invalidMetadata = await requireResponse(
      await routeSession(
        new Request(
          `http://localhost/api/sessions/${fixture.source.sessionId}`,
          {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ summary: 'x'.repeat(12_001) }),
          },
        ),
        fixture.ctx,
      ),
    )
    expect(invalidMetadata.status).toBe(400)
    await expect(invalidMetadata.json()).resolves.toEqual({
      ok: false,
      error: 'Invalid session metadata',
    })

    const blockedConfigPath = join(dirname(fixture.cwd), 'metadata-root-file')
    writeFileSync(blockedConfigPath, 'not a directory', 'utf8')
    process.env.KODE_CONFIG_DIR = blockedConfigPath
    const persistenceFailure = await requireResponse(
      await routeSession(
        new Request(
          `http://localhost/api/sessions/${fixture.source.sessionId}`,
          {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ tag: 'persist' }),
          },
        ),
        fixture.ctx,
      ),
    )
    expect(persistenceFailure.status).toBe(500)
    await expect(persistenceFailure.json()).resolves.toEqual({
      ok: false,
      error: 'Failed to persist session',
    })
  })

  test('rejects unknown and cross-workspace session access without leaking history', async () => {
    const fixture = createFixture()
    const unknown = '55555555-5555-4555-8555-555555555555'

    const unknownResponse = await requireResponse(
      await routeSession(
        new Request(`http://localhost/api/sessions/${unknown}`),
        fixture.ctx,
      ),
    )
    expect(unknownResponse.status).toBe(404)

    const crossWorkspaceResponse = await requireResponse(
      await routeSession(
        new Request(
          `http://localhost/api/sessions/${fixture.source.sessionId}?workspace=other`,
        ),
        fixture.ctx,
      ),
    )
    expect(crossWorkspaceResponse.status).toBe(404)
  })
})
