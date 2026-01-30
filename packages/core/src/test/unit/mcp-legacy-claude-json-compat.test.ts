import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { getCwd, setCwd } from '#core/utils/state'
import { getMcprcServerStatus, listMCPServers } from '#core/mcp/client'
import { __resetMcpListChangedForTests } from '#core/mcp/client/listChanged'

describe('MCP legacy .claude.json compatibility', () => {
  let previousHome: string | undefined
  let previousKodeConfigDir: string | undefined
  let runnerCwd: string

  let homeDir: string
  let configDir: string
  let projectDir: string

  beforeEach(async () => {
    previousHome = process.env.HOME
    previousKodeConfigDir = process.env.KODE_CONFIG_DIR
    runnerCwd = getCwd()

    homeDir = mkdtempSync(join(tmpdir(), 'kode-home-'))
    configDir = mkdtempSync(join(tmpdir(), 'kode-config-'))
    projectDir = mkdtempSync(join(tmpdir(), 'kode-project-'))

    process.env.HOME = homeDir
    process.env.KODE_CONFIG_DIR = configDir

    await setCwd(projectDir)
    __resetMcpListChangedForTests()

    writeFileSync(
      join(projectDir, '.mcp.json'),
      JSON.stringify(
        {
          mcpServers: {
            compatShared: {
              command: 'npx',
              args: ['shared-mcp@latest'],
            },
          },
        },
        null,
        2,
      ),
      'utf-8',
    )

    writeFileSync(
      join(homeDir, '.claude.json'),
      JSON.stringify(
        {
          mcpServers: {
            legacyUser: {
              command: 'npx',
              args: ['legacy-user-mcp@latest'],
            },
          },
          projects: {
            [projectDir]: {
              mcpServers: {
                legacyLocal: {
                  command: 'npx',
                  args: ['legacy-local-mcp@latest'],
                },
              },
              enabledMcpjsonServers: ['compatShared'],
              disabledMcpjsonServers: [],
            },
          },
        },
        null,
        2,
      ),
      'utf-8',
    )
  })

  afterEach(async () => {
    await setCwd(runnerCwd)

    if (previousHome === undefined) delete process.env.HOME
    else process.env.HOME = previousHome

    if (previousKodeConfigDir === undefined) delete process.env.KODE_CONFIG_DIR
    else process.env.KODE_CONFIG_DIR = previousKodeConfigDir

    rmSync(homeDir, { recursive: true, force: true })
    rmSync(configDir, { recursive: true, force: true })
    rmSync(projectDir, { recursive: true, force: true })
  })

  test('imports user + local MCP servers from legacy config', () => {
    const servers = listMCPServers()
    expect(Object.keys(servers)).toContain('legacyUser')
    expect(Object.keys(servers)).toContain('legacyLocal')
  })

  test('respects enabledMcpjsonServers from legacy project config', () => {
    expect(getMcprcServerStatus('compatShared')).toBe('approved')
  })
})
