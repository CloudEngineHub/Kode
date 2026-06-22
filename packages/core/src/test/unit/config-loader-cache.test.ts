import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  clearConfigCacheForTesting,
  enableConfigs,
  getGlobalConfig,
  saveGlobalConfig,
} from '#config'

describe('config loader cache', () => {
  const originalNodeEnv = process.env.NODE_ENV
  const originalKodeConfigDir = process.env.KODE_CONFIG_DIR
  const originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR
  let configDir = ''
  let configFile = ''

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'kode-config-cache-'))
    configFile = join(configDir, 'config.json')
    process.env.NODE_ENV = 'development'
    process.env.KODE_CONFIG_DIR = configDir
    delete process.env.CLAUDE_CONFIG_DIR
    clearConfigCacheForTesting()
  })

  afterEach(() => {
    clearConfigCacheForTesting()
    if (configDir && existsSync(configDir)) {
      rmSync(configDir, { recursive: true, force: true })
    }
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = originalNodeEnv
    }
    if (originalKodeConfigDir === undefined) {
      delete process.env.KODE_CONFIG_DIR
    } else {
      process.env.KODE_CONFIG_DIR = originalKodeConfigDir
    }
    if (originalClaudeConfigDir === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR
    } else {
      process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir
    }
  })

  test('enableConfigs caches subsequent global config reads', () => {
    writeFileSync(configFile, JSON.stringify({ numStartups: 7 }), 'utf-8')

    enableConfigs()
    writeFileSync(configFile, JSON.stringify({ numStartups: 99 }), 'utf-8')

    expect(getGlobalConfig().numStartups).toBe(7)
  })

  test('saveGlobalConfig preserves existing projects without using caller projects', () => {
    const projectPath = join(configDir, 'project')
    writeFileSync(
      configFile,
      JSON.stringify({
        numStartups: 1,
        projects: {
          [projectPath]: {
            allowedTools: ['Bash'],
          },
        },
      }),
      'utf-8',
    )

    enableConfigs()
    saveGlobalConfig({
      ...(getGlobalConfig() as any),
      numStartups: 2,
      projects: {
        shouldNotBeSaved: {
          allowedTools: ['Edit'],
        },
      },
    } as any)

    const saved = JSON.parse(readFileSync(configFile, 'utf-8'))
    expect(saved.numStartups).toBe(2)
    expect(saved.projects).toEqual({
      [projectPath]: {
        allowedTools: ['Bash'],
      },
    })
  })

  test('saveGlobalConfig updates the in-memory cache after writing', () => {
    writeFileSync(configFile, JSON.stringify({ numStartups: 3 }), 'utf-8')

    enableConfigs()
    saveGlobalConfig({ ...(getGlobalConfig() as any), numStartups: 4 } as any)
    writeFileSync(configFile, JSON.stringify({ numStartups: 99 }), 'utf-8')

    expect(getGlobalConfig().numStartups).toBe(4)
  })

  test('NODE_ENV=test continues to use the test config object', () => {
    process.env.NODE_ENV = 'test'
    clearConfigCacheForTesting()
    const original = { ...(getGlobalConfig() as any) }

    try {
      saveGlobalConfig({
        ...(getGlobalConfig() as any),
        numStartups: 123,
      } as any)
      expect(getGlobalConfig().numStartups).toBe(123)
    } finally {
      saveGlobalConfig(original as any)
    }
  })
})
