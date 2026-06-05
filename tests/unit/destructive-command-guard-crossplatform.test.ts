import { describe, expect, test } from 'bun:test'
import { getBashDestructiveCommandBlock } from '@utils/sandbox/destructiveCommandGuard'

describe('destructiveCommandGuard cross-platform path handling', () => {
  describe('Unix platform (darwin)', () => {
    test('blocks rm targeting filesystem root', () => {
      const block = getBashDestructiveCommandBlock({
        command: 'rm -rf /',
        cwd: '/Users/alice/project',
        originalCwd: '/Users/alice/project',
        homeDir: '/Users/alice',
        platform: 'darwin',
        commandSource: 'agent_call',
      })
      expect(block).not.toBeNull()
      expect(block!.message).toContain('critical directory')
      expect(block!.resolvedTarget).toBe('/')
    })

    test('blocks rm targeting home directory via ~', () => {
      const block = getBashDestructiveCommandBlock({
        command: 'rm -rf ~',
        cwd: '/Users/alice/project',
        originalCwd: '/Users/alice/project',
        homeDir: '/Users/alice',
        platform: 'darwin',
        commandSource: 'agent_call',
      })
      expect(block).not.toBeNull()
      expect(block!.resolvedTarget).toBe('/Users/alice')
    })

    test('blocks rm targeting original working directory', () => {
      const block = getBashDestructiveCommandBlock({
        command: 'rm -rf .',
        cwd: '/Users/alice/project',
        originalCwd: '/Users/alice/project',
        homeDir: '/Users/alice',
        platform: 'darwin',
        commandSource: 'agent_call',
      })
      expect(block).not.toBeNull()
      expect(block!.resolvedTarget).toBe('/Users/alice/project')
    })

    test('blocks rm targeting top-level system directories', () => {
      const block = getBashDestructiveCommandBlock({
        command: 'sudo rm -rf /usr',
        cwd: '/Users/alice/project',
        originalCwd: '/Users/alice/project',
        homeDir: '/Users/alice',
        platform: 'darwin',
        commandSource: 'agent_call',
      })
      expect(block).not.toBeNull()
      expect(block!.resolvedTarget).toBe('/usr')
    })

    test('allows non-critical removals inside project', () => {
      const block = getBashDestructiveCommandBlock({
        command: 'rm -rf node_modules',
        cwd: '/Users/alice/project',
        originalCwd: '/Users/alice/project',
        homeDir: '/Users/alice',
        platform: 'darwin',
        commandSource: 'agent_call',
      })
      expect(block).toBeNull()
    })

    test('blocks shell-expanded targets', () => {
      const block = getBashDestructiveCommandBlock({
        command: 'rm -rf $HOME',
        cwd: '/Users/alice/project',
        originalCwd: '/Users/alice/project',
        homeDir: '/Users/alice',
        platform: 'darwin',
        commandSource: 'agent_call',
      })
      expect(block).not.toBeNull()
      expect(block!.message).toContain('shell expansion')
    })

    test('does not apply to user_bash_mode', () => {
      const block = getBashDestructiveCommandBlock({
        command: 'rm -rf /',
        cwd: '/Users/alice/project',
        originalCwd: '/Users/alice/project',
        homeDir: '/Users/alice',
        platform: 'darwin',
        commandSource: 'user_bash_mode',
      })
      expect(block).toBeNull()
    })

    test('allows when override flag is passed', () => {
      const block = getBashDestructiveCommandBlock({
        command: 'rm -rf /',
        cwd: '/Users/alice/project',
        originalCwd: '/Users/alice/project',
        homeDir: '/Users/alice',
        platform: 'darwin',
        commandSource: 'agent_call',
        allowOverride: true,
      })
      expect(block).toBeNull()
    })
  })

  describe('Linux platform', () => {
    test('blocks rm targeting root on linux', () => {
      const block = getBashDestructiveCommandBlock({
        command: 'rm -rf /',
        cwd: '/home/alice/project',
        originalCwd: '/home/alice/project',
        homeDir: '/home/alice',
        platform: 'linux',
        commandSource: 'agent_call',
      })
      expect(block).not.toBeNull()
      expect(block!.resolvedTarget).toBe('/')
    })

    test('blocks rm targeting home on linux', () => {
      const block = getBashDestructiveCommandBlock({
        command: 'rm -rf ~',
        cwd: '/home/alice/project',
        originalCwd: '/home/alice/project',
        homeDir: '/home/alice',
        platform: 'linux',
        commandSource: 'agent_call',
      })
      expect(block).not.toBeNull()
      expect(block!.resolvedTarget).toBe('/home/alice')
    })

    test('allows non-critical removal on linux', () => {
      const block = getBashDestructiveCommandBlock({
        command: 'rm -rf build',
        cwd: '/home/alice/project',
        originalCwd: '/home/alice/project',
        homeDir: '/home/alice',
        platform: 'linux',
        commandSource: 'agent_call',
      })
      expect(block).toBeNull()
    })
  })

  describe('Windows platform', () => {
    test('blocks rm targeting drive root on win32', () => {
      const block = getBashDestructiveCommandBlock({
        command: 'rm -rf /',
        cwd: 'C:\\Users\\alice\\project',
        originalCwd: 'C:\\Users\\alice\\project',
        homeDir: 'C:\\Users\\alice',
        platform: 'win32',
        commandSource: 'agent_call',
      })
      expect(block).not.toBeNull()
      expect(block!.message).toContain('critical directory')
    })

    test('blocks rm targeting home directory on win32', () => {
      const block = getBashDestructiveCommandBlock({
        command: 'rm -rf ~',
        cwd: 'C:\\Users\\alice\\project',
        originalCwd: 'C:\\Users\\alice\\project',
        homeDir: 'C:\\Users\\alice',
        platform: 'win32',
        commandSource: 'agent_call',
      })
      expect(block).not.toBeNull()
      expect(block!.resolvedTarget).toContain('Users')
      expect(block!.resolvedTarget).toContain('alice')
    })

    test('blocks rm targeting original cwd on win32', () => {
      const block = getBashDestructiveCommandBlock({
        command: 'rm -rf .',
        cwd: 'C:\\Users\\alice\\project',
        originalCwd: 'C:\\Users\\alice\\project',
        homeDir: 'C:\\Users\\alice',
        platform: 'win32',
        commandSource: 'agent_call',
      })
      expect(block).not.toBeNull()
      expect(block!.resolvedTarget).toContain('project')
    })

    test('allows non-critical removal on win32', () => {
      const block = getBashDestructiveCommandBlock({
        command: 'rm -rf node_modules',
        cwd: 'C:\\Users\\alice\\project',
        originalCwd: 'C:\\Users\\alice\\project',
        homeDir: 'C:\\Users\\alice',
        platform: 'win32',
        commandSource: 'agent_call',
      })
      expect(block).toBeNull()
    })

    test('does not apply to user_bash_mode on win32', () => {
      const block = getBashDestructiveCommandBlock({
        command: 'rm -rf /',
        cwd: 'C:\\Users\\alice\\project',
        originalCwd: 'C:\\Users\\alice\\project',
        homeDir: 'C:\\Users\\alice',
        platform: 'win32',
        commandSource: 'user_bash_mode',
      })
      expect(block).toBeNull()
    })
  })

  describe('platform-specific path resolution consistency', () => {
    test('Unix home directory is blocked on darwin', () => {
      const block = getBashDestructiveCommandBlock({
        command: 'rm -rf /Users/alice',
        cwd: '/Users/alice/project',
        originalCwd: '/Users/alice/project',
        homeDir: '/Users/alice',
        platform: 'darwin',
        commandSource: 'agent_call',
      })
      expect(block).not.toBeNull()
      expect(block!.resolvedTarget).toBe('/Users/alice')
    })

    test('Windows home directory is blocked on win32', () => {
      const block = getBashDestructiveCommandBlock({
        command: 'rm -rf ~',
        cwd: 'C:\\Users\\alice\\project',
        originalCwd: 'C:\\Users\\alice\\project',
        homeDir: 'C:\\Users\\alice',
        platform: 'win32',
        commandSource: 'agent_call',
      })
      expect(block).not.toBeNull()
    })

    test('rmdir is also guarded', () => {
      const block = getBashDestructiveCommandBlock({
        command: 'rmdir /',
        cwd: '/Users/alice/project',
        originalCwd: '/Users/alice/project',
        homeDir: '/Users/alice',
        platform: 'darwin',
        commandSource: 'agent_call',
      })
      expect(block).not.toBeNull()
    })

    test('multiple rm targets are all checked', () => {
      const block = getBashDestructiveCommandBlock({
        command: 'rm -rf /usr /home',
        cwd: '/Users/alice/project',
        originalCwd: '/Users/alice/project',
        homeDir: '/Users/alice',
        platform: 'darwin',
        commandSource: 'agent_call',
      })
      expect(block).not.toBeNull()
    })
  })
})
