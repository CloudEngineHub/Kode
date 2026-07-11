import { describe, expect, test } from 'bun:test'
import {
  RemoteExecutionKernel,
  assessWindowsExecution,
  selectExecutionKernel,
} from '#runtime/execution'

describe('Windows execution kernel policy', () => {
  test('fails closed for background writes even with an approval', () => {
    const decision = assessWindowsExecution({
      command: 'npm test',
      cwd: 'C:\\repo',
      mode: 'background',
      writesFilesystem: true,
      approvalGranted: true,
      managedWorktree: true,
      platform: 'win32',
    })
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toBe('windows_requires_remote_isolation')
  })

  test('permits only approved foreground read-only local execution', () => {
    expect(
      assessWindowsExecution({
        command: 'git status',
        cwd: 'C:\\repo',
        mode: 'foreground',
        writesFilesystem: false,
        approvalGranted: true,
        platform: 'win32',
      }).allowed,
    ).toBe(true)
  })

  test('routes a denied Windows request to an available remote kernel', () => {
    const remote = new RemoteExecutionKernel({
      available: true,
      stronglyIsolated: true,
    })
    const kernel = selectExecutionKernel({
      request: {
        command: 'npm test',
        cwd: 'C:\\repo',
        mode: 'goal',
        writesFilesystem: true,
        platform: 'win32',
        requireStrongIsolation: true,
      },
      remote,
    })
    expect(kernel.kind).toBe('remote')
    expect(
      kernel.assess({
        command: 'npm test',
        cwd: 'C:\\repo',
        mode: 'goal',
        writesFilesystem: true,
        platform: 'win32',
        requireStrongIsolation: true,
      }).allowed,
    ).toBe(true)
  })

  test('refuses a weak remote kernel for Windows unattended writes', () => {
    const remote = new RemoteExecutionKernel({
      available: true,
      stronglyIsolated: false,
    })
    expect(
      remote.assess({
        command: 'npm test',
        cwd: 'C:\\repo',
        mode: 'goal',
        writesFilesystem: true,
        platform: 'win32',
      }).allowed,
    ).toBe(false)
  })
})
