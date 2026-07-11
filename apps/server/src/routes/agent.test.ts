import { describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'

import type { DaemonAgentDefinition, DaemonManagedAgent } from '@kode/protocol'

import { AgentControlService } from '../agentControlService'
import { routeAgent } from './agent'

const revision = 'a'.repeat(64)
const definition: DaemonAgentDefinition = {
  agentType: 'review-agent',
  whenToUse: 'Review changes for correctness and regressions.',
  systemPrompt: 'Review the change and report concrete findings.',
  tools: ['Read', 'Grep'],
}
const agent: DaemonManagedAgent = {
  ...definition,
  source: 'projectSettings',
  revision,
}

function createService(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    list: () => [],
    get: () => ({ ok: false, reason: 'not_found' }),
    create: async () => ({
      ok: true,
      value: { agent, appliesTo: 'new_subagents' },
    }),
    update: async () => ({
      ok: true,
      value: { agent, appliesTo: 'new_subagents' },
    }),
    delete: async () => ({ ok: true, value: { deleted: true } }),
    ...overrides,
  } as unknown as AgentControlService
}

function context(agentService: AgentControlService) {
  return {
    cwd: 'C:/repo',
    agentService,
    listWorkspaces: async () => ({
      currentId: 'repo',
      workspaces: [
        { id: 'repo', path: 'C:/repo' },
        { id: 'other', path: 'C:/other' },
      ],
    }),
  }
}

describe('routeAgent', () => {
  test('creates only in a registered workspace and does not accept a path', async () => {
    let received: Record<string, unknown> | null = null
    const service = createService({
      create: async (args: Record<string, unknown>) => {
        received = args
        return { ok: true, value: { agent, appliesTo: 'new_subagents' } }
      },
    })
    const response = await routeAgent(
      new Request('http://localhost/api/agents?workspace=other', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source: 'projectSettings', agent: definition }),
      }),
      context(service),
    )

    if (!response) throw new Error('missing response')
    expect(response.status).toBe(201)
    expect(received).toMatchObject({
      cwd: resolve('C:/other'),
      source: 'projectSettings',
      agent: definition,
    })

    const unknownWorkspace = await routeAgent(
      new Request('http://localhost/api/agents?workspace=C:/unsafe/path', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source: 'projectSettings', agent: definition }),
      }),
      context(service),
    )
    if (!unknownWorkspace) throw new Error('missing response')
    expect(unknownWorkspace.status).toBe(404)

    const missingWorkspace = await routeAgent(
      new Request('http://localhost/api/agents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source: 'projectSettings', agent: definition }),
      }),
      context(service),
    )
    if (!missingWorkspace) throw new Error('missing response')
    expect(missingWorkspace.status).toBe(400)
    expect(await missingWorkspace.json()).toEqual({
      ok: false,
      error: 'Workspace is required',
    })
  })

  test('maps immutable or stale mutation states without leaking storage paths', async () => {
    const conflict = createService({
      update: async () => ({ ok: false, reason: 'revision_conflict' }),
      delete: async () => ({ ok: false, reason: 'legacy_read_only' }),
    })
    const update = await routeAgent(
      new Request('http://localhost/api/agents/review-agent?workspace=repo', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          source: 'projectSettings',
          expectedRevision: revision,
          agent: definition,
        }),
      }),
      context(conflict),
    )
    if (!update) throw new Error('missing response')
    expect(update.status).toBe(409)
    expect(await update.json()).toEqual({
      ok: false,
      error: 'Agent configuration conflict',
    })

    const remove = await routeAgent(
      new Request('http://localhost/api/agents/review-agent?workspace=repo', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          source: 'projectSettings',
          expectedRevision: revision,
        }),
      }),
      context(conflict),
    )
    if (!remove) throw new Error('missing response')
    expect(remove.status).toBe(403)
    expect(await remove.json()).toEqual({
      ok: false,
      error: 'Agent configuration is read-only',
    })
  })

  test('requires a mutable source for detail reads', async () => {
    const response = await routeAgent(
      new Request('http://localhost/api/agents/review-agent'),
      context(createService()),
    )
    if (!response) throw new Error('missing response')
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      ok: false,
      error: 'Invalid mutable agent source',
    })
  })
})
