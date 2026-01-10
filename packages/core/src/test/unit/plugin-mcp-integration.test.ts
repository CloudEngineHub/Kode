import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  getClients,
  listMCPServers,
  listPluginMCPServers,
} from '#core/mcp/client'
import { configureSessionPlugins } from '#cli-services/pluginRuntime'
import { setCwd } from '#core/utils/state'
import { __resetSessionPluginsForTests } from '#core/utils/sessionPlugins'

function clearMemoizeCache(value: unknown): void {
  const candidate = value as { cache?: { clear?: () => void } }
  candidate.cache?.clear?.()
}

describe('Plugin MCP integration (.mcp.json + plugin.json mcpServers)', () => {
  const runnerCwd = process.cwd()
  const originalConfigDir = process.env.KODE_CONFIG_DIR
  const originalToken = process.env.MY_TOKEN
  const originalExec = process.env.KODE_TEST_EXEC
  const originalTimeout = process.env.MCP_CONNECTION_TIMEOUT_MS

  let projectDir: string
  let homeDir: string
  let pluginRoot: string

  beforeEach(async () => {
    projectDir = mkdtempSync(join(tmpdir(), 'kode-plugin-mcp-proj-'))
    homeDir = mkdtempSync(join(tmpdir(), 'kode-plugin-mcp-home-'))
    process.env.KODE_CONFIG_DIR = join(homeDir, '.kode')
    process.env.MY_TOKEN = 'shh'
    process.env.KODE_TEST_EXEC = process.execPath
    process.env.MCP_CONNECTION_TIMEOUT_MS = '1500'
    await setCwd(projectDir)

    pluginRoot = join(projectDir, 'my-plugin')
    mkdirSync(join(pluginRoot, '.claude-plugin'), { recursive: true })
    writeFileSync(
      join(pluginRoot, '.claude-plugin', 'plugin.json'),
      JSON.stringify(
        {
          name: 'my-plugin',
          version: '1.0.0',
          mcpServers: {
            inline: {
              command: '${KODE_TEST_EXEC}',
              args: ['-e', 'process.exit(1)', '${CLAUDE_PLUGIN_ROOT}'],
              env: { TOKEN: '${MY_TOKEN}', ROOT: '${CLAUDE_PLUGIN_ROOT}' },
            },
          },
        },
        null,
        2,
      ) + '\n',
      'utf8',
    )

    writeFileSync(
      join(pluginRoot, '.mcp.json'),
      JSON.stringify(
        {
          fileServer: {
            command: '${KODE_TEST_EXEC}',
            args: ['-e', 'process.exit(1)'],
            env: { TOKEN: '${MY_TOKEN}' },
          },
        },
        null,
        2,
      ) + '\n',
      'utf8',
    )
  })

  afterEach(async () => {
    __resetSessionPluginsForTests()
    clearMemoizeCache(getClients)
    await setCwd(runnerCwd)
    if (originalConfigDir === undefined) delete process.env.KODE_CONFIG_DIR
    else process.env.KODE_CONFIG_DIR = originalConfigDir
    if (originalToken === undefined) delete process.env.MY_TOKEN
    else process.env.MY_TOKEN = originalToken
    if (originalExec === undefined) delete process.env.KODE_TEST_EXEC
    else process.env.KODE_TEST_EXEC = originalExec
    if (originalTimeout === undefined)
      delete process.env.MCP_CONNECTION_TIMEOUT_MS
    else process.env.MCP_CONNECTION_TIMEOUT_MS = originalTimeout
    rmSync(projectDir, { recursive: true, force: true })
    rmSync(homeDir, { recursive: true, force: true })
  })

  test('loads servers, expands templates, and exposes them via listMCPServers/getClients', async () => {
    await configureSessionPlugins({ pluginDirs: [pluginRoot] })

    const pluginServers = listPluginMCPServers()
    expect(Object.keys(pluginServers).sort()).toEqual([
      'plugin_my-plugin_fileServer',
      'plugin_my-plugin_inline',
    ])

    expect(pluginServers['plugin_my-plugin_fileServer']).toMatchObject({
      command: process.execPath,
      args: ['-e', 'process.exit(1)'],
      env: { TOKEN: 'shh' },
    })

    expect(pluginServers['plugin_my-plugin_inline']).toMatchObject({
      command: process.execPath,
      env: { TOKEN: 'shh', ROOT: pluginRoot },
    })
    {
      const inline = pluginServers['plugin_my-plugin_inline']
      if (!inline || !('args' in inline) || !Array.isArray(inline.args)) {
        throw new Error(
          'Expected inline plugin MCP server to be stdio with args',
        )
      }
      expect(inline.args).toContain(pluginRoot)
    }

    const allServers = listMCPServers()
    expect(allServers['plugin_my-plugin_fileServer']).toBeDefined()

    const clients = await getClients()
    const fileServerClient = clients.find(
      c => c.name === 'plugin_my-plugin_fileServer',
    )
    expect(fileServerClient).toBeDefined()
    expect(fileServerClient!.type).toBe('failed')
  })
})
