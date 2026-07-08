import { describe, expect, test } from 'bun:test'
import {
  buildRuntimeEnvironmentPrompt,
  detectShellName,
  detectTerminalName,
  normalizeShellName,
  type RuntimeEnvironmentInfo,
} from '#core/utils/runtimeEnvironment'

const baseInfo: RuntimeEnvironmentInfo = {
  platform: 'linux',
  arch: 'x64',
  osType: 'Linux',
  osRelease: '6.0.0',
  runtimeName: 'node',
  runtimeVersion: 'v22.0.0',
  shell: 'bash',
  terminal: 'unknown',
}

describe('runtime environment prompt', () => {
  test('detects common Windows shells from environment variables', () => {
    expect(
      detectShellName(
        { PSModulePath: 'C:\\Program Files\\PowerShell\\Modules' },
        'win32',
      ),
    ).toBe('PowerShell')

    expect(
      detectShellName({ ComSpec: 'C:\\Windows\\System32\\cmd.exe' }, 'win32'),
    ).toBe('cmd.exe')
  })

  test('normalizes shell executable paths', () => {
    expect(
      normalizeShellName('C:\\Program Files\\PowerShell\\7\\pwsh.exe'),
    ).toBe('PowerShell')
    expect(normalizeShellName('/bin/zsh')).toBe('zsh')
  })

  test('detects Windows Terminal by name instead of session id', () => {
    expect(detectTerminalName({ WT_SESSION: 'session-id' })).toBe(
      'Windows Terminal',
    )
  })

  test('adds Windows-specific multiline command guidance', () => {
    const prompt = buildRuntimeEnvironmentPrompt({
      ...baseInfo,
      platform: 'win32',
      osType: 'Windows_NT',
      osRelease: '10.0.26100',
      shell: 'PowerShell',
      terminal: 'Windows Terminal',
    })

    expect(prompt).toContain('You are running on Windows (win32, x64)')
    expect(prompt).toContain('avoid Bash-only syntax')
    expect(prompt).toContain('git commit --file <path>')
    expect(prompt).toContain('gh pr create --body-file <path>')
  })

  test('keeps POSIX guidance for non-Windows platforms', () => {
    const prompt = buildRuntimeEnvironmentPrompt(baseInfo)

    expect(prompt).toContain('You are running on Linux (linux, x64)')
    expect(prompt).toContain('If the shell is POSIX-compatible')
  })
})
