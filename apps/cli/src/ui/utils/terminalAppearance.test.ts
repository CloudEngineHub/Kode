import { describe, expect, it } from 'bun:test'

import {
  createTerminalAppearanceSnapshot,
  formatTerminalAppearanceLines,
  getWindowsTerminalFeatureSupport,
  parseWindowsTerminalVersion,
} from './terminalAppearance'

describe('terminal appearance helpers', () => {
  it('parses Windows Terminal version strings from environment values', () => {
    expect(parseWindowsTerminalVersion(undefined)).toBeUndefined()
    expect(parseWindowsTerminalVersion('not-a-version')).toBeUndefined()
    expect(parseWindowsTerminalVersion('1.24.1234.0')).toEqual({
      raw: '1.24.1234.0',
      major: 1,
      minor: 24,
      patch: 1234,
    })
    expect(parseWindowsTerminalVersion('Windows Terminal 1.12.0')).toEqual({
      raw: 'Windows Terminal 1.12.0',
      major: 1,
      minor: 12,
      patch: 0,
    })
  })

  it('maps version-gated Windows Terminal profile settings', () => {
    expect(
      getWindowsTerminalFeatureSupport(parseWindowsTerminalVersion('1.9.0')),
    ).toMatchObject({
      fontObject: 'no',
      legacyFontFields: 'yes',
      opacity: 'no',
      acrylicOpacity: 'yes',
      adjacentSettingsAssets: 'no',
    })

    expect(
      getWindowsTerminalFeatureSupport(parseWindowsTerminalVersion('1.10.0')),
    ).toMatchObject({
      fontObject: 'yes',
      legacyFontFields: 'no',
      opacity: 'no',
      adjacentSettingsAssets: 'no',
    })

    expect(
      getWindowsTerminalFeatureSupport(parseWindowsTerminalVersion('1.12.0')),
    ).toMatchObject({
      fontObject: 'yes',
      opacity: 'yes',
      adjacentSettingsAssets: 'no',
    })

    expect(
      getWindowsTerminalFeatureSupport(parseWindowsTerminalVersion('1.24.0')),
    ).toMatchObject({
      opacity: 'yes',
      adjacentSettingsAssets: 'yes',
    })

    expect(getWindowsTerminalFeatureSupport(undefined)).toMatchObject({
      fontObject: 'unknown',
      legacyFontFields: 'unknown',
      opacity: 'unknown',
      acrylicOpacity: 'yes',
      adjacentSettingsAssets: 'unknown',
      backgroundImage: 'yes',
      adjustIndistinguishableColors: 'yes',
    })
  })

  it('detects Windows Terminal from WT environment variables', () => {
    const snapshot = createTerminalAppearanceSnapshot({
      terminalName: 'Windows Terminal',
      terminalBackgroundColor: '#101010',
      env: {
        TERM: 'xterm-256color',
        WT_SESSION: 'session-id',
        WT_PROFILE_ID: 'profile-id',
        TERM_PROGRAM_VERSION: '1.24.1234.0',
      },
    })

    expect(snapshot.windowsTerminal.detected).toBe(true)
    expect(snapshot.windowsTerminal.version).toMatchObject({
      major: 1,
      minor: 24,
      patch: 1234,
    })
    expect(snapshot.windowsTerminal.versionSource).toBe('TERM_PROGRAM_VERSION')
    expect(snapshot.windowsTerminal.canQueryCustomBackground).toBe(false)
    expect(snapshot.windowsTerminal.canQueryProfileOpacity).toBe(false)
    expect(snapshot.windowsTerminal.featureSupport.adjacentSettingsAssets).toBe(
      'yes',
    )
  })

  it('does not treat generic terminals as Windows Terminal', () => {
    const snapshot = createTerminalAppearanceSnapshot({
      env: {
        TERM: 'xterm-256color',
        TERM_PROGRAM: 'vscode',
      },
    })

    expect(snapshot.windowsTerminal.detected).toBe(false)
    expect(snapshot.windowsTerminal.version).toBeUndefined()
  })

  it('formats actionable appearance diagnostics without inspecting settings', () => {
    const snapshot = createTerminalAppearanceSnapshot({
      terminalBackgroundColor: '#101010',
      env: {
        WT_SESSION: 'session-id',
        WT_PROFILE_ID: 'profile-id',
        TERM_PROGRAM_VERSION: '1.12.0',
      },
    })

    const lines = formatTerminalAppearanceLines(snapshot)

    expect(lines).toContain('Appearance')
    expect(lines).toContain('- Windows Terminal: yes (1.12.0)')
    expect(lines).toContain('- OSC 11 background: #101010')
    expect(lines).toContain(
      '- WT env: session=yes; profile=yes; version=1.12.0',
    )
    expect(lines).toContain(
      '- WT profile image/opacity settings are not queryable from the running app; settings.json is not inspected.',
    )
  })
})
