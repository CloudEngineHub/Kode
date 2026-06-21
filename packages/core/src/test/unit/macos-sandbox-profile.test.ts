import { describe, expect, test } from 'bun:test'
import { existsSync } from 'fs'
import { buildMacosSandboxExecCommand } from '#runtime/shell'
import type { BunShellSandboxOptions } from '#runtime/shell'
import { buildSandboxCommand } from '#runtime/shell/sandboxCommand'

describe('macOS sandbox-exec profile hardening', () => {
  test('profile allows writing to /dev/null when write-restricted', () => {
    if (process.platform !== 'darwin') return

    const cmd = buildMacosSandboxExecCommand({
      sandboxExecPath: '/usr/bin/sandbox-exec',
      binShellPath: 'bash',
      command: 'echo hi',
      needsNetworkRestriction: false,
      readConfig: { denyOnly: [] },
      writeConfig: { allowOnly: ['.'], denyWithinAllow: [] },
    })

    const profile = cmd[2] as string
    expect(profile).toContain('(literal "/dev/null")')
  })

  test('prefers /usr/bin/sandbox-exec over PATH', () => {
    if (process.platform !== 'darwin') return
    if (!existsSync('/usr/bin/sandbox-exec')) return

    const sandbox: BunShellSandboxOptions = {
      enabled: true,
      require: true,
      needsNetworkRestriction: true,
      readConfig: { denyOnly: [] },
      writeConfig: { allowOnly: ['.'], denyWithinAllow: [] },
      __platformOverride: 'darwin',
    }

    const built = buildSandboxCommand({
      command: 'echo hi',
      sandbox,
      cwd: process.cwd(),
    })
    expect(built).toBeTruthy()
    expect(built!.cmd[0]).toBe('/usr/bin/sandbox-exec')
  })
})
