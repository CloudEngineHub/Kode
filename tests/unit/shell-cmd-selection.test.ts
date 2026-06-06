import { describe, expect, test } from 'bun:test'
import { BunShell, getShellStdioForPlatform } from '@utils/bun/shell'

describe('shell command selection', () => {
  test('win32 uses ComSpec when provided', () => {
    const cmd = BunShell.getShellCmdForPlatform('win32', 'echo hi', {
      ComSpec: 'C:\\Windows\\System32\\cmd.exe',
    } as any)
    expect(cmd[0]).toBe('C:\\Windows\\System32\\cmd.exe')
    expect(cmd.slice(1, 3)).toEqual(['/c', 'echo hi'])
  })

  test('win32 falls back to cmd when ComSpec missing', () => {
    const cmd = BunShell.getShellCmdForPlatform('win32', 'echo hi', {} as any)
    expect(cmd[0]).toBe('cmd')
  })

  test('unix uses /bin/sh when available', () => {
    const cmd = BunShell.getShellCmdForPlatform('darwin', 'echo hi', {} as any)
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
