import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import which from 'which'
import { BunShell } from '#runtime/shell'
import { BashTool } from '#tools/tools/system/BashTool/BashTool'

function isSandboxBinaryAvailable(): boolean {
  if (process.platform === 'linux') {
    return !!(
      which.sync('bwrap', { nothrow: true }) ??
      which.sync('bubblewrap', { nothrow: true })
    )
  }
  if (process.platform === 'darwin') {
    return !!which.sync('sandbox-exec', { nothrow: true })
  }
  return false
}

function writeJson(filePath: string, value: unknown) {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf-8')
}

describe('BashTool sandbox indicator (compatibility)', () => {
  const originalCwd = process.cwd()
  const originalHome = process.env.HOME
  const originalIndicator = process.env.KODE_BASH_SANDBOX_SHOW_INDICATOR

  let projectDir: string
  let homeDir: string

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'kode-bash-indicator-project-'))
    homeDir = mkdtempSync(join(tmpdir(), 'kode-bash-indicator-home-'))
  })

  afterEach(() => {
    process.env.KODE_BASH_SANDBOX_SHOW_INDICATOR = originalIndicator
    if (originalHome === undefined) delete process.env.HOME
    else process.env.HOME = originalHome
    process.chdir(originalCwd)
    BunShell.restart()

    rmSync(projectDir, { recursive: true, force: true })
    rmSync(homeDir, { recursive: true, force: true })
  })

  test('shows SandboxedBash when sandbox enabled and indicator env is set', () => {
    if (!isSandboxBinaryAvailable()) return

    writeJson(join(projectDir, '.kode', 'settings.json'), {
      sandbox: { enabled: true },
    })

    process.env.HOME = homeDir
    process.env.KODE_BASH_SANDBOX_SHOW_INDICATOR = '1'

    process.chdir(projectDir)
    BunShell.restart()

    expect(
      BashTool.userFacingName?.({
        command: 'echo hi',
        dangerouslyDisableSandbox: false,
      }),
    ).toBe('SandboxedBash')
  })

  test('falls back to Bash when indicator env is unset', () => {
    writeJson(join(projectDir, '.kode', 'settings.json'), {
      sandbox: { enabled: true },
    })

    process.env.HOME = homeDir
    delete process.env.KODE_BASH_SANDBOX_SHOW_INDICATOR

    process.chdir(projectDir)
    BunShell.restart()

    expect(
      BashTool.userFacingName?.({
        command: 'echo hi',
        dangerouslyDisableSandbox: false,
      }),
    ).toBe('Bash')
  })

  test('falls back to Bash when indicator env is not explicitly truthy', () => {
    writeJson(join(projectDir, '.kode', 'settings.json'), {
      sandbox: { enabled: true },
    })

    process.env.HOME = homeDir
    process.env.KODE_BASH_SANDBOX_SHOW_INDICATOR = '2'

    process.chdir(projectDir)
    BunShell.restart()

    expect(
      BashTool.userFacingName?.({
        command: 'echo hi',
        dangerouslyDisableSandbox: false,
      }),
    ).toBe('Bash')
  })
})
