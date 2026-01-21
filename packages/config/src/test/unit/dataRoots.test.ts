import { describe, expect, test } from 'bun:test'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import { getGlobalConfigFilePath } from '#config/paths'
import {
  getSettingsFileCandidates,
  saveSettingsToPrimaryAndSyncLegacy,
} from '#config/files'
import { getKodeRoot, resolveDataRoots } from '#config/dataRoots'
import {
  getSessionLogFilePath,
  sanitizeProjectNameForSessionStore,
} from '#protocol/utils/kodeAgentSessionLog'

async function withEnv<T>(
  updates: Record<string, string | undefined>,
  fn: () => Promise<T> | T,
): Promise<T> {
  const previous: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(updates)) {
    previous[key] = process.env[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  try {
    return await fn()
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

describe('data roots (Kode-first, legacy read-only compat)', () => {
  test('resolveDataRoots defaults to ~/.kode (primary) + ~/.claude (compat)', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'kode-home-'))
    try {
      const roots = resolveDataRoots({ homeDir })
      expect(roots.kodeRoot).toBe(join(homeDir, '.kode'))
      expect(roots.claudeCompatRoots).toEqual([join(homeDir, '.claude')])
      expect(roots.allRoots).toEqual([
        join(homeDir, '.kode'),
        join(homeDir, '.claude'),
      ])
    } finally {
      rmSync(homeDir, { recursive: true, force: true })
    }
  })

  test('resolveDataRoots: KODE_CONFIG_DIR wins; CLAUDE_CONFIG_DIR only affects compat roots', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'kode-home-'))
    const kodeOverride = join(homeDir, 'custom', 'kode-root')
    const claudeOverride = join(homeDir, 'custom', 'claude-root')

    try {
      await withEnv(
        {
          HOME: homeDir,
          KODE_CONFIG_DIR: kodeOverride,
          CLAUDE_CONFIG_DIR: claudeOverride,
          ANYKODE_CONFIG_DIR: undefined,
        },
        () => {
          const roots = resolveDataRoots({ homeDir, respectEnvOverride: true })
          expect(roots.kodeRoot).toBe(resolve(kodeOverride))
          expect(roots.claudeCompatRoots[0]).toBe(resolve(claudeOverride))
          expect(roots.claudeCompatRoots).toContain(join(homeDir, '.claude'))
          expect(roots.allRoots[0]).toBe(resolve(kodeOverride))
        },
      )
    } finally {
      rmSync(homeDir, { recursive: true, force: true })
    }
  })

  test('resolveDataRoots: CLAUDE_CONFIG_DIR never changes kodeRoot', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'kode-home-'))
    const claudeOverride = join(homeDir, 'custom', 'claude-root')

    try {
      await withEnv(
        {
          HOME: homeDir,
          KODE_CONFIG_DIR: undefined,
          ANYKODE_CONFIG_DIR: undefined,
          CLAUDE_CONFIG_DIR: claudeOverride,
        },
        () => {
          const roots = resolveDataRoots({ homeDir, respectEnvOverride: true })
          expect(roots.kodeRoot).toBe(join(homeDir, '.kode'))
          expect(roots.claudeCompatRoots[0]).toBe(resolve(claudeOverride))
        },
      )
    } finally {
      rmSync(homeDir, { recursive: true, force: true })
    }
  })

  test('getKodeRoot expands ~/ overrides and trims whitespace', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'kode-home-'))
    try {
      await withEnv(
        {
          HOME: homeDir,
          KODE_CONFIG_DIR: '  ~/my-kode  ',
          ANYKODE_CONFIG_DIR: undefined,
        },
        () => {
          expect(getKodeRoot({ homeDir, respectEnvOverride: true })).toBe(
            resolve(join(homeDir, 'my-kode')),
          )
        },
      )
    } finally {
      rmSync(homeDir, { recursive: true, force: true })
    }
  })

  test('getGlobalConfigFilePath ignores CLAUDE_CONFIG_DIR', async () => {
    await withEnv(
      {
        KODE_CONFIG_DIR: undefined,
        ANYKODE_CONFIG_DIR: undefined,
        CLAUDE_CONFIG_DIR: join(tmpdir(), 'claude-only'),
      },
      () => {
        expect(getGlobalConfigFilePath()).toBe(join(homedir(), '.kode.json'))
      },
    )
  })

  test('userSettings primary is always .kode even when CLAUDE_CONFIG_DIR is set', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'kode-home-'))
    const claudeOverride = join(homeDir, 'custom-claude-root')
    try {
      await withEnv(
        {
          HOME: homeDir,
          KODE_CONFIG_DIR: undefined,
          ANYKODE_CONFIG_DIR: undefined,
          CLAUDE_CONFIG_DIR: claudeOverride,
        },
        () => {
          const candidates = getSettingsFileCandidates({
            destination: 'userSettings',
          })
          expect(candidates?.primary).toBe(
            join(homeDir, '.kode', 'settings.json'),
          )
          expect(candidates?.legacy ?? []).toContain(
            join(resolve(claudeOverride), 'settings.json'),
          )
          expect(candidates?.legacy ?? []).toContain(
            join(homeDir, '.claude', 'settings.json'),
          )
        },
      )
    } finally {
      rmSync(homeDir, { recursive: true, force: true })
    }
  })

  test('saveSettingsToPrimaryAndSyncLegacy never writes legacy .claude files', () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'kode-proj-'))
    try {
      const legacyPath = join(projectDir, '.claude', 'settings.json')
      mkdirSync(dirname(legacyPath), { recursive: true })
      writeFileSync(
        legacyPath,
        JSON.stringify({ where: 'legacy' }, null, 2) + '\n',
        'utf8',
      )

      saveSettingsToPrimaryAndSyncLegacy({
        destination: 'projectSettings',
        projectDir,
        settings: { where: 'primary' },
        syncLegacyIfExists: true,
      })

      const legacy = JSON.parse(readFileSync(legacyPath, 'utf8'))
      expect(legacy.where).toBe('legacy')
      expect(existsSync(join(projectDir, '.kode', 'settings.json'))).toBe(true)
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
    }
  })

  test('session log paths always target kodeRoot (even when CLAUDE_CONFIG_DIR is set)', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'kode-home-'))
    const projectDir = mkdtempSync(join(tmpdir(), 'kode-proj-'))
    const claudeOverride = join(homeDir, 'custom-claude-root')

    try {
      await withEnv(
        {
          HOME: homeDir,
          KODE_CONFIG_DIR: undefined,
          ANYKODE_CONFIG_DIR: undefined,
          CLAUDE_CONFIG_DIR: claudeOverride,
        },
        () => {
          const sessionId = '11111111-1111-1111-1111-111111111111'
          expect(getSessionLogFilePath({ cwd: projectDir, sessionId })).toBe(
            join(
              homeDir,
              '.kode',
              'projects',
              sanitizeProjectNameForSessionStore(projectDir),
              `${sessionId}.jsonl`,
            ),
          )
        },
      )
    } finally {
      rmSync(homeDir, { recursive: true, force: true })
      rmSync(projectDir, { recursive: true, force: true })
    }
  })
})
