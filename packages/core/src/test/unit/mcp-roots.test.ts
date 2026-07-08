import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  __setMcpRootsTrustOverrideForTests,
  createMcpRootsForCwd,
  getMcpClientCapabilities,
  registerMcpClientRequestHandlers,
} from '#core/mcp/client/roots'
import { getCwd, setCwd } from '#core/utils/state'

describe('MCP client roots', () => {
  afterEach(() => {
    __setMcpRootsTrustOverrideForTests(null)
  })

  test('creates file URI roots from the current workspace path', () => {
    const root = createMcpRootsForCwd('C:\\Users\\test\\project')[0]
    expect(root?.uri).toBe(pathToFileURL('C:\\Users\\test\\project').toString())
    expect(root?.name).toBe('project')
  })

  test('declares roots capability only for trusted workspaces', () => {
    __setMcpRootsTrustOverrideForTests(false)
    expect(getMcpClientCapabilities()).toEqual({})

    __setMcpRootsTrustOverrideForTests(true)
    expect(getMcpClientCapabilities()).toEqual({ roots: {} })
  })

  test('registers roots/list handler when roots are exposed', async () => {
    const originalCwd = getCwd()
    const projectDir = mkdtempSync(join(tmpdir(), 'kode-mcp-roots-'))
    let handler: (() => Promise<unknown>) | null = null

    try {
      await setCwd(projectDir)
      __setMcpRootsTrustOverrideForTests(true)

      registerMcpClientRequestHandlers({
        setRequestHandler: (_schema: unknown, fn: () => Promise<unknown>) => {
          handler = fn
        },
      } as any)

      expect(handler).not.toBeNull()
      expect(await handler?.()).toEqual({
        roots: createMcpRootsForCwd(projectDir),
      })
    } finally {
      await setCwd(originalCwd)
      rmSync(projectDir, { recursive: true, force: true })
    }
  })
})
