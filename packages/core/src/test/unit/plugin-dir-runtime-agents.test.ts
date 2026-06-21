import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { configureSessionPlugins } from '#cli-services/pluginRuntime'
import {
  clearAgentCache,
  getAgentByType,
  getAvailableAgentTypes,
} from '#core/utils/agentLoader'
import { __resetSessionPluginsForTests } from '#core/utils/sessionPlugins'
import { setCwd } from '#core/utils/state'

describe('--plugin-dir runtime: agents cache refresh', () => {
  const runnerCwd = process.cwd()

  let projectDir: string
  let pluginDir: string

  beforeEach(async () => {
    __resetSessionPluginsForTests()
    clearAgentCache()

    projectDir = mkdtempSync(join(tmpdir(), 'kode-plugin-agents-'))
    await setCwd(projectDir)

    pluginDir = join(projectDir, 'my-plugin')
    mkdirSync(join(pluginDir, '.kode-plugin'), { recursive: true })
    writeFileSync(
      join(pluginDir, '.kode-plugin', 'plugin.json'),
      JSON.stringify({ name: 'my-plugin', version: '1.0.0' }, null, 2) + '\n',
      'utf8',
    )

    mkdirSync(join(pluginDir, 'agents'), { recursive: true })
    writeFileSync(
      join(pluginDir, 'agents', 'my-agent.md'),
      `---\nname: my-plugin-agent\ndescription: Test agent\n---\n\nYou are a test agent.\n`,
      'utf8',
    )
  })

  afterEach(async () => {
    __resetSessionPluginsForTests()
    clearAgentCache()
    await setCwd(runnerCwd)
    rmSync(projectDir, { recursive: true, force: true })
  })

  test('configureSessionPlugins clears agent caches so plugin agents become visible', async () => {
    const before = await getAvailableAgentTypes()
    expect(before).not.toContain('my-plugin-agent')

    await configureSessionPlugins({ pluginDirs: [pluginDir] })

    const after = await getAvailableAgentTypes()
    expect(after).toContain('my-plugin-agent')

    const agent = await getAgentByType('my-plugin-agent')
    expect(agent?.source).toBe('plugin')
  })
})
