import { describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import {
  getCwd,
  getOriginalCwd,
  setCwd,
  setOriginalCwd,
} from '@kode/core/utils/state'

import { startKodeDaemon, type KodeDaemon } from './server'
import { processDaemonRuntimeCoordinator } from './turnGate'

async function restoreRuntimeCwd(cwd: string, originalCwd: string) {
  await processDaemonRuntimeCoordinator.runStartupExclusive(async () => {
    setOriginalCwd(originalCwd)
    await setCwd(cwd)
  })
}

function agentUrl(daemon: KodeDaemon, workspace: string, suffix = ''): URL {
  const url = new URL(
    `http://${daemon.host}:${daemon.port}/api/agents${suffix}`,
  )
  url.searchParams.set('workspace', workspace)
  return url
}

describe('daemon Agent control API', () => {
  test('persists revisioned project Agents behind the daemon token', async () => {
    const runtimeCwd = getCwd()
    const runtimeOriginalCwd = getOriginalCwd()
    const workspace = mkdtempSync(join(tmpdir(), 'kode-daemon-agent-control-'))
    let daemon: KodeDaemon | null = null

    const definition = {
      agentType: 'review-agent',
      whenToUse: 'Review changes for correctness and regressions.',
      systemPrompt: 'Review the requested change and report concrete findings.',
      tools: '*',
      forkContext: true,
    }

    try {
      daemon = await startKodeDaemon({
        cwd: workspace,
        port: 0,
        echo: true,
      })

      const unauthorized = await fetch(agentUrl(daemon, resolve(workspace)))
      expect(unauthorized.status).toBe(401)

      const headers = {
        authorization: `Bearer ${daemon.token}`,
        'content-type': 'application/json',
      }
      const malformedResponse = await fetch(
        agentUrl(daemon, resolve(workspace)),
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            source: 'projectSettings',
            agent: { ...definition, tools: ['Read()'] },
          }),
        },
      )
      expect(malformedResponse.status).toBe(400)

      const parentOnlyToolResponse = await fetch(
        agentUrl(daemon, resolve(workspace)),
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            source: 'projectSettings',
            agent: { ...definition, tools: ['Task'] },
          }),
        },
      )
      expect(parentOnlyToolResponse.status).toBe(400)

      const createdResponse = await fetch(
        agentUrl(daemon, resolve(workspace)),
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            source: 'projectSettings',
            agent: definition,
          }),
        },
      )
      expect(createdResponse.status).toBe(201)
      const created = (await createdResponse.json()) as {
        agent: {
          revision: string
          agentType: string
          source: string
          forkContext?: boolean
        }
        appliesTo: string
      }
      const createdRevision = created.agent.revision
      expect(created.appliesTo).toBe('new_subagents')
      expect(created.agent.agentType).toBe(definition.agentType)
      expect(created.agent.source).toBe('projectSettings')
      expect(created.agent.forkContext).toBe(true)
      expect(createdRevision).toMatch(/^[a-f0-9]{64}$/)
      expect(
        existsSync(join(workspace, '.kode', 'agents', 'review-agent.md')),
      ).toBe(true)

      const listedResponse = await fetch(agentUrl(daemon, resolve(workspace)), {
        headers,
      })
      expect(listedResponse.status).toBe(200)
      await expect(listedResponse.json()).resolves.toMatchObject({
        agents: [
          {
            agentType: definition.agentType,
            source: 'projectSettings',
            revision: createdRevision,
          },
        ],
      })

      const detailUrl = agentUrl(
        daemon,
        resolve(workspace),
        `/${definition.agentType}`,
      )
      detailUrl.searchParams.set('source', 'projectSettings')
      const detailResponse = await fetch(detailUrl, { headers })
      expect(detailResponse.status).toBe(200)
      await expect(detailResponse.json()).resolves.toMatchObject({
        agent: {
          agentType: definition.agentType,
          revision: createdRevision,
        },
      })

      const updatedResponse = await fetch(
        agentUrl(daemon, resolve(workspace), `/${definition.agentType}`),
        {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            source: 'projectSettings',
            expectedRevision: createdRevision,
            agent: { ...definition, color: 'blue' },
          }),
        },
      )
      expect(updatedResponse.status).toBe(200)
      const updated = (await updatedResponse.json()) as {
        agent: { revision: string; color?: string }
      }
      expect(updated.agent).toMatchObject({ color: 'blue' })
      expect(updated.agent.revision).not.toBe(createdRevision)

      const staleResponse = await fetch(
        agentUrl(daemon, resolve(workspace), `/${definition.agentType}`),
        {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            source: 'projectSettings',
            expectedRevision: createdRevision,
            agent: { ...definition, color: 'green' },
          }),
        },
      )
      expect(staleResponse.status).toBe(409)

      const deletedResponse = await fetch(
        agentUrl(daemon, resolve(workspace), `/${definition.agentType}`),
        {
          method: 'DELETE',
          headers,
          body: JSON.stringify({
            source: 'projectSettings',
            expectedRevision: updated.agent.revision,
          }),
        },
      )
      expect(deletedResponse.status).toBe(200)
      await expect(deletedResponse.json()).resolves.toEqual({ deleted: true })
      expect(
        existsSync(join(workspace, '.kode', 'agents', 'review-agent.md')),
      ).toBe(false)
    } finally {
      daemon?.stop()
      await restoreRuntimeCwd(runtimeCwd, runtimeOriginalCwd)
      rmSync(workspace, { recursive: true, force: true })
    }
  }, 20_000)
})
