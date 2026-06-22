import { describe, expect, test } from 'bun:test'
import { BunShell, getShellStdioForPlatform } from '#runtime/shell'

describe('shell command selection', () => {
  test('win32 uses ComSpec when provided', () => {
    const env: Record<string, string | undefined> = {
      ComSpec: 'C:\\Windows\\System32\\cmd.exe',
    }
    const cmd = BunShell.getShellCmdForPlatform('win32', 'echo hi', env)
    expect(cmd[0]).toBe('C:\\Windows\\System32\\cmd.exe')
    expect(cmd.slice(1, 3)).toEqual(['/c', 'echo hi'])
  })

  test('win32 falls back to cmd when ComSpec missing', () => {
    const env: Record<string, string | undefined> = {}
    const cmd = BunShell.getShellCmdForPlatform('win32', 'echo hi', env)
    expect(cmd[0]).toBe('cmd')
  })

  test('unix uses /bin/sh when available', () => {
    const env: Record<string, string | undefined> = {}
    const cmd = BunShell.getShellCmdForPlatform('darwin', 'echo hi', env)
    expect(cmd[1]).toBe('-c')
    expect(cmd[2]).toBe('echo hi')
  })

  test('non-Windows shell stdio ignores stdin and pipes output', () => {
    expect(getShellStdioForPlatform('linux')).toEqual([
      'ignore',
      'pipe',
      'pipe',
    ])
  })

  test('Windows shell stdio ignores stdin and uses overlapped output pipes', () => {
    expect(getShellStdioForPlatform('win32')).toEqual([
      'ignore',
      'overlapped',
      'overlapped',
    ])
  })
})
