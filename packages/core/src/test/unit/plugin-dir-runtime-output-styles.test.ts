import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import {
  clearOutputStyleCache,
  getAvailableOutputStyles,
} from '#cli-services/outputStyles'
import { configureSessionPlugins } from '#cli-services/pluginRuntime'
import { __resetSessionPluginsForTests } from '#core/utils/sessionPlugins'
import { setCwd } from '#core/utils/state'

describe('--plugin-dir runtime: output styles discovery', () => {
  const runnerCwd = process.cwd()

  let projectDir: string
  let pluginDir: string

  beforeEach(async () => {
    __resetSessionPluginsForTests()
    clearOutputStyleCache()

    projectDir = mkdtempSync(join(tmpdir(), 'kode-plugin-output-styles-'))
    await setCwd(projectDir)

    pluginDir = join(projectDir, 'style-plugin')
    mkdirSync(join(pluginDir, '.kode-plugin'), { recursive: true })
    writeFileSync(
      join(pluginDir, '.kode-plugin', 'plugin.json'),
      JSON.stringify({ name: 'style-plugin', version: '1.0.0' }, null, 2) +
        '\n',
      'utf8',
    )

    mkdirSync(join(pluginDir, 'output-styles'), { recursive: true })
    writeFileSync(
      join(pluginDir, 'output-styles', 'concise.md'),
      `---\nname: concise\ndescription: Concise output style\n---\n\nBe concise.\n`,
      'utf8',
    )
  })

  afterEach(async () => {
    __resetSessionPluginsForTests()
    clearOutputStyleCache()
    await setCwd(runnerCwd)
    rmSync(projectDir, { recursive: true, force: true })
  })

  test('loads plugin output styles and clears cache on configureSessionPlugins', async () => {
    const before = getAvailableOutputStyles()
    expect(before['style-plugin:concise']).toBeUndefined()

    await configureSessionPlugins({ pluginDirs: [pluginDir] })

    const after = getAvailableOutputStyles()
    expect(after['style-plugin:concise']).toMatchObject({ source: 'plugin' })
  })
})
