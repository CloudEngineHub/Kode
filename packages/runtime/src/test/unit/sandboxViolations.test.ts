import { describe, expect, test } from 'bun:test'

import {
  annotateStderrWithSandboxViolations,
  stripSandboxViolations,
} from '#runtime/shell/sandboxViolations'

describe('sandbox violation stderr annotations', () => {
  test('annotates tagged macOS sandbox denials with <sandbox_violations> block', () => {
    const stderr =
      'sandbox-exec: deny file-read-data /etc/passwd (KODE_SANDBOX)\nOther error\n'
    const annotated = annotateStderrWithSandboxViolations({
      command: 'cat /etc/passwd',
      stderr,
      sandbox: { enabled: true, __platformOverride: 'darwin' },
    })

    expect(annotated).toContain('<sandbox_violations>')
    expect(annotated).toContain('</sandbox_violations>')
    expect(annotated).toContain(
      'sandbox-exec: deny file-read-data /etc/passwd (KODE_SANDBOX)',
    )

    // Idempotent: do not double-append.
    const annotatedAgain = annotateStderrWithSandboxViolations({
      command: 'cat /etc/passwd',
      stderr: annotated,
      sandbox: { enabled: true, __platformOverride: 'darwin' },
    })
    expect(annotatedAgain).toBe(annotated)

    expect(stripSandboxViolations(annotated)).toBe(stderr.trim())
  })

  test('does not trim stderr when no sandbox_violations block exists', () => {
    const stderr = 'Some error\n'
    expect(stripSandboxViolations(stderr)).toBe(stderr)
  })

  test('does not annotate non-darwin stderr', () => {
    const stderr = 'Operation not permitted'
    const annotated = annotateStderrWithSandboxViolations({
      command: 'echo hi',
      stderr,
      sandbox: { enabled: true, __platformOverride: 'linux' },
    })
    expect(annotated).toBe(stderr)
  })
})
